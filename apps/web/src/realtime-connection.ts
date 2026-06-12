export const realtimeReconnectInitialDelayMs = 1_000;
export const realtimeReconnectMaxDelayMs = 30_000;

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
  onMessage: (data: unknown) => void;
  onOpen?: () => void;
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
  let reconnectAttempt = 0;

  function clearReconnectTimer() {
    if (reconnectTimer === null) return;
    clearScheduledTimeout(reconnectTimer);
    reconnectTimer = null;
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
      if (socket === currentSocket) socket = null;
      options.onUnavailable?.();
      scheduleReconnect();
    };

    currentSocket.onopen = () => {
      if (stopped) return;
      reconnectAttempt = 0;
      options.onOpen?.();
    };
    currentSocket.onmessage = (event) => {
      if (!stopped) options.onMessage(event.data);
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
