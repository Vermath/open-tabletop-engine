import { Buffer } from "node:buffer";
import WebSocket, { type ClientOptions } from "ws";
import { normalizeWebSocketCloseCode, parseTunnelFrameText, serializeTunnelFrame, tunnelFrameSchemaVersion, type TunnelFrame, type TunnelHeaders } from "@open-tabletop/tunnel-protocol";

export interface RelayTunnelSessionOptions {
  relayBaseUrl: string;
  localWebBaseUrl: string;
  inviteToken?: string;
  log?: (message: string) => void;
  relayWebSocketFactory?: (url: URL, options: ClientOptions) => WebSocket;
}

export interface RelayTunnelSessionStatus {
  state: "starting" | "connected" | "error" | "stopped";
  relayBaseUrl: string;
  tableSlug?: string;
  publicUrl?: string;
  inviteUrl?: string;
  lastError?: string;
}

interface RelayTableResponse {
  slug: string;
  hostToken: string;
  publicUrl: string;
  expiresAt: string;
}

interface PendingHttpRequest {
  method: string;
  path: string;
  headers: TunnelHeaders;
  chunks: Buffer[];
  bytes: number;
}

interface LocalWebSocketTunnel {
  socket: WebSocket;
  opened: boolean;
  queuedMessages: Buffer[];
  queuedBytes: number;
}

export const relayHttpResponseFrameBytes = 256 * 1024;
export const relayHttpResponseMaxBytes = 64 * 1024 * 1024;
export const relayHttpRequestMaxBytes = 8 * 1024 * 1024;
export const relayBufferedHttpRequestMaxBytes = 64 * 1024 * 1024;
export const relayWebSocketMessageMaxBytes = 1024 * 1024;
export const relayHostFrameMaxBytes = 12 * 1024 * 1024;
const relayPendingHttpRequestMax = 64;
const relayStartTimeoutMs = 15_000;
const localWebSocketOpenQueueMaxMessages = 64;
const localWebSocketOpenQueueMaxBytes = 1024 * 1024;

export class RelayTunnelSession {
  private relaySocket: WebSocket | null = null;
  private readonly pendingHttpRequests = new Map<string, PendingHttpRequest>();
  private bufferedHttpRequestBytes = 0;
  private readonly activeHttpForwards = new Map<string, AbortController>();
  private readonly localSockets = new Map<string, LocalWebSocketTunnel>();
  private statusValue: RelayTunnelSessionStatus;
  private stopRequested = false;
  private startAbortController: AbortController | undefined;
  private startOperation: Promise<RelayTunnelSessionStatus> | undefined;
  private stopOperation: Promise<void> | undefined;

  constructor(private readonly options: RelayTunnelSessionOptions) {
    this.statusValue = { state: "starting", relayBaseUrl: normalizeBaseUrl(options.relayBaseUrl) };
  }

  status(): RelayTunnelSessionStatus {
    return { ...this.statusValue };
  }

  async start(): Promise<RelayTunnelSessionStatus> {
    if (this.stopOperation) await this.stopOperation;
    const previousStart = this.startOperation;
    if (previousStart) {
      if (!this.stopRequested) throw new Error("Desktop sharing is already starting");
      await previousStart.catch(() => undefined);
      if (this.startOperation === previousStart) this.startOperation = undefined;
    }
    if (this.statusValue.state === "connected") return this.status();
    const operation = this.performStart();
    this.startOperation = operation;
    try {
      return await operation;
    } finally {
      if (this.startOperation === operation) this.startOperation = undefined;
    }
  }

  private async performStart(): Promise<RelayTunnelSessionStatus> {
    this.stopRequested = false;
    const abortController = new AbortController();
    this.startAbortController = abortController;
    const timeout = setTimeout(() => abortController.abort(), relayStartTimeoutMs);
    try {
      const table = await this.createTable(abortController.signal);
      if (this.stopRequested) throw new Error("Desktop sharing was stopped before the relay connected");
      this.statusValue = {
        state: "starting",
        relayBaseUrl: normalizeBaseUrl(this.options.relayBaseUrl),
        tableSlug: table.slug,
        publicUrl: table.publicUrl,
        inviteUrl: withInviteToken(table.publicUrl, this.options.inviteToken)
      };
      await this.connectHostSocket(table, abortController.signal);
      if (this.stopRequested) throw new Error("Desktop sharing was stopped before the relay connected");
      this.statusValue = { ...this.statusValue, state: "connected" };
      return this.status();
    } catch (error) {
      const lastError = errorMessage(error);
      const stoppedByCaller = this.stopRequested;
      await this.stop().catch(() => undefined);
      if (!stoppedByCaller) this.statusValue = { ...this.statusValue, state: "error", lastError };
      throw error;
    } finally {
      clearTimeout(timeout);
      if (this.startAbortController === abortController) this.startAbortController = undefined;
    }
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    this.startAbortController?.abort();
    this.statusValue = { ...this.statusValue, state: "stopped" };
    const existing = this.stopOperation;
    if (existing) return existing;
    const operation = this.performStop();
    this.stopOperation = operation;
    try {
      await operation;
    } finally {
      if (this.stopOperation === operation) this.stopOperation = undefined;
    }
  }

  private async performStop(): Promise<void> {
    this.abortActiveHttpForwards("Desktop sharing stopped");
    for (const local of this.localSockets.values()) {
      if (local.socket.readyState === WebSocket.OPEN) local.socket.close(1000, "Desktop sharing stopped");
      else if (local.socket.readyState !== WebSocket.CLOSED) local.socket.terminate();
    }
    this.localSockets.clear();
    this.clearPendingHttpRequests();
    const socket = this.relaySocket;
    this.relaySocket = null;
    if (socket?.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve) => {
        let settled = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (timeout) clearTimeout(timeout);
          resolve();
        };
        socket.once("close", finish);
        socket.close(1000, "Desktop sharing stopped");
        timeout = setTimeout(() => {
          if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
          finish();
        }, 500);
      });
    } else if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.terminate();
    }
  }

  private async createTable(signal: AbortSignal): Promise<RelayTableResponse> {
    const response = await fetch(`${normalizeBaseUrl(this.options.relayBaseUrl)}/v1/tables`, { method: "POST", signal });
    if (!response.ok) throw new Error(`Relay table creation failed with ${response.status}`);
    return (await response.json()) as RelayTableResponse;
  }

  private async connectHostSocket(table: RelayTableResponse, signal: AbortSignal): Promise<void> {
    const socketUrl = new URL(`${normalizeBaseUrl(this.options.relayBaseUrl)}/v1/hosts/${table.slug}`);
    socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
    const socketOptions = relayHostWebSocketOptions(table.hostToken);
    const socket = this.options.relayWebSocketFactory?.(socketUrl, socketOptions) ?? new WebSocket(socketUrl, socketOptions);
    this.relaySocket = socket;
    socket.on("message", (data) => {
      if (this.relaySocket !== socket || this.stopRequested) return;
      this.handleRelayMessage(data).catch((error) => this.fail(`Tunnel frame failed: ${errorMessage(error)}`));
    });
    socket.on("error", (error) => {
      if (this.relaySocket !== socket || this.stopRequested) return;
      this.fail(`Relay socket failed: ${errorMessage(error)}`);
    });
    socket.on("close", () => {
      if (this.relaySocket !== socket) return;
      this.relaySocket = null;
      if (this.statusValue.state === "connected") this.statusValue = { ...this.statusValue, state: "stopped" };
      this.abortActiveHttpForwards("Relay disconnected");
      this.clearPendingHttpRequests();
      for (const local of this.localSockets.values()) local.socket.close(1011, "Relay disconnected");
      this.localSockets.clear();
    });
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        socket.off("open", onOpen);
        socket.off("error", onError);
        socket.off("close", onClose);
        signal.removeEventListener("abort", onAbort);
      };
      const settle = (callback: () => void) => {
        cleanup();
        callback();
      };
      const onOpen = () => settle(resolve);
      const onError = (error: Error) => settle(() => reject(error));
      const onClose = () => settle(() => reject(new Error("Relay socket closed before the host connection opened")));
      const onAbort = () => settle(() => reject(new Error("Relay connection attempt timed out or was stopped")));
      socket.once("open", onOpen);
      socket.once("error", onError);
      socket.once("close", onClose);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    this.sendFrame({
      type: "host.hello",
      protocolVersion: tunnelFrameSchemaVersion,
      tableSlug: table.slug,
      hostToken: table.hostToken
    });
  }

  private async handleRelayMessage(data: WebSocket.RawData): Promise<void> {
    const frame = parseTunnelFrameText(rawDataToBuffer(data).toString("utf8"));
    switch (frame.type) {
      case "http.request":
        if (this.pendingHttpRequests.has(frame.requestId)) return;
        if (this.pendingHttpRequests.size + this.activeHttpForwards.size >= relayPendingHttpRequestMax) {
          this.sendHttpError(frame.requestId, 429, "desktop_tunnel_too_many_requests", "Too many pending tunneled requests");
          return;
        }
        this.pendingHttpRequests.set(frame.requestId, { method: frame.method, path: frame.path, headers: frame.headers, chunks: [], bytes: 0 });
        return;
      case "http.body": {
        const request = this.pendingHttpRequests.get(frame.requestId);
        if (!request) return;
        const chunk = Buffer.from(frame.bodyBase64, "base64");
        if (request.bytes + chunk.byteLength > relayHttpRequestMaxBytes) {
          this.takePendingHttpRequest(frame.requestId);
          this.sendHttpError(frame.requestId, 413, "desktop_tunnel_request_too_large", `Relay request exceeds ${relayHttpRequestMaxBytes} bytes`);
          return;
        }
        if (this.bufferedHttpRequestBytes + chunk.byteLength > relayBufferedHttpRequestMaxBytes) {
          this.takePendingHttpRequest(frame.requestId);
          this.sendHttpError(frame.requestId, 429, "desktop_tunnel_request_buffer_full", "Desktop tunnel request buffer is full");
          return;
        }
        request.chunks.push(chunk);
        request.bytes += chunk.byteLength;
        this.bufferedHttpRequestBytes += chunk.byteLength;
        return;
      }
      case "http.end":
        await this.forwardHttpRequest(frame.requestId);
        return;
      case "ws.open":
        this.openLocalWebSocket(frame);
        return;
      case "ws.message":
        this.sendLocalWebSocketMessage(frame.socketId, Buffer.from(frame.bodyBase64, "base64"));
        return;
      case "ws.close":
        this.localSockets.get(frame.socketId)?.socket.close(frame.code ?? 1000, frame.reason);
        this.localSockets.delete(frame.socketId);
        return;
      case "control.ping":
        this.sendFrame({ type: "control.ping", sentAt: new Date().toISOString() });
        return;
      default:
        return;
    }
  }

  private async forwardHttpRequest(requestId: string): Promise<void> {
    const request = this.takePendingHttpRequest(requestId, false);
    if (!request) return;
    const relaySocket = this.relaySocket;
    if (!relaySocket || relaySocket.readyState !== WebSocket.OPEN) {
      this.releaseBufferedHttpRequestBytes(request.bytes);
      return;
    }
    const abortController = new AbortController();
    this.activeHttpForwards.set(requestId, abortController);
    try {
      const body = request.chunks.length > 0 ? Buffer.concat(request.chunks) : undefined;
      request.chunks = [];
      const response = await fetch(
        new URL(request.path, this.options.localWebBaseUrl),
        localHttpRequestOptions(request.method, request.headers, body, abortController.signal)
      );
      const headers: TunnelHeaders = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      await this.sendFrameAsync({ type: "http.response", requestId, status: response.status, headers }, relaySocket);
      await streamResponseBodyChunks(response, async (chunk) => {
        for (const frameChunk of chunkBufferForTunnel(chunk)) {
          await this.sendFrameAsync({ type: "http.body", requestId, bodyBase64: frameChunk.toString("base64") }, relaySocket);
        }
      }, relayHttpResponseMaxBytes, abortController.signal);
      await this.sendFrameAsync({ type: "http.end", requestId }, relaySocket);
    } catch (error) {
      if (!abortController.signal.aborted && this.relaySocket === relaySocket && relaySocket.readyState === WebSocket.OPEN) {
        await this.sendFrameAsync({
          type: "http.error",
          requestId,
          status: 502,
          code: "desktop_tunnel_bad_gateway",
          message: errorMessage(error)
        }, relaySocket).catch(() => undefined);
      }
    } finally {
      this.releaseBufferedHttpRequestBytes(request.bytes);
      if (this.activeHttpForwards.get(requestId) === abortController) this.activeHttpForwards.delete(requestId);
    }
  }

  private openLocalWebSocket(frame: Extract<TunnelFrame, { type: "ws.open" }>): void {
    if (this.localSockets.has(frame.socketId)) {
      this.sendFrame({ type: "ws.close", socketId: frame.socketId, code: 1008, reason: "Duplicate tunnel socket id" });
      return;
    }
    const target = new URL(frame.path, this.options.localWebBaseUrl);
    target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
    const protocols = localWebSocketProtocols(frame.headers);
    const headers = localRequestHeaders(frame.headers);
    const localSocketOptions = localWebSocketClientOptions(headers);
    const localSocket = protocols.length > 0 ? new WebSocket(target, protocols, localSocketOptions) : new WebSocket(target, localSocketOptions);
    const local: LocalWebSocketTunnel = { socket: localSocket, opened: false, queuedMessages: [], queuedBytes: 0 };
    this.localSockets.set(frame.socketId, local);
    localSocket.on("open", () => {
      if (this.localSockets.get(frame.socketId)?.socket !== localSocket) return;
      local.opened = true;
      const queued = local.queuedMessages.splice(0);
      local.queuedBytes = 0;
      try {
        for (const body of queued) {
          if (localSocket.readyState !== WebSocket.OPEN) break;
          localSocket.send(body);
        }
      } catch (error) {
        this.closeLocalWebSocket(frame.socketId, 1011, boundedWebSocketCloseReason(errorMessage(error)));
      }
    });
    localSocket.on("message", (data) => {
      if (this.localSockets.get(frame.socketId)?.socket !== localSocket) return;
      let body: Buffer;
      try {
        body = localWebSocketMessageBuffer(data);
      } catch {
        this.closeLocalWebSocket(frame.socketId, 1009, "Desktop backend WebSocket message is too large");
        return;
      }
      this.sendFrame({ type: "ws.message", socketId: frame.socketId, bodyBase64: body.toString("base64") });
    });
    localSocket.on("close", (code, reason) => {
      if (this.localSockets.get(frame.socketId)?.socket !== localSocket) return;
      this.localSockets.delete(frame.socketId);
      this.sendFrame({ type: "ws.close", socketId: frame.socketId, code: normalizeWebSocketCloseCode(code), reason: reason.toString("utf8") });
    });
    localSocket.on("error", (error) => {
      if (this.localSockets.get(frame.socketId)?.socket !== localSocket) return;
      this.closeLocalWebSocket(frame.socketId, 1011, boundedWebSocketCloseReason(errorMessage(error)));
    });
  }

  private sendLocalWebSocketMessage(socketId: string, body: Buffer): void {
    const local = this.localSockets.get(socketId);
    if (!local) return;
    if (local.socket.readyState === WebSocket.OPEN) {
      local.opened = true;
      local.socket.send(body);
      return;
    }
    if (local.socket.readyState !== WebSocket.CONNECTING) {
      this.closeLocalWebSocket(socketId, 1011, "Desktop backend WebSocket is not open");
      return;
    }
    if (local.queuedMessages.length >= localWebSocketOpenQueueMaxMessages || local.queuedBytes + body.byteLength > localWebSocketOpenQueueMaxBytes) {
      this.closeLocalWebSocket(socketId, 1013, "Desktop backend WebSocket opened too slowly");
      return;
    }
    local.queuedMessages.push(body);
    local.queuedBytes += body.byteLength;
  }

  private closeLocalWebSocket(socketId: string, code: number, reason: string): void {
    const local = this.localSockets.get(socketId);
    if (!local) return;
    this.localSockets.delete(socketId);
    const safeCode = normalizeWebSocketCloseCode(code);
    local.socket.close(safeCode, reason);
    this.sendFrame({ type: "ws.close", socketId, code: safeCode, reason });
  }

  private sendFrame(frame: TunnelFrame): void {
    if (this.relaySocket?.readyState !== WebSocket.OPEN) return;
    this.relaySocket.send(serializeTunnelFrame(frame));
  }

  private async sendFrameAsync(frame: TunnelFrame, socket: WebSocket): Promise<void> {
    if (this.relaySocket !== socket || socket.readyState !== WebSocket.OPEN) throw new Error("Relay socket is not connected");
    const serialized = serializeTunnelFrame(frame);
    await new Promise<void>((resolve, reject) => {
      socket.send(serialized, (error) => error ? reject(error) : resolve());
    });
  }

  private sendHttpError(requestId: string, status: number, error: string, message: string): void {
    this.sendFrame({ type: "http.error", requestId, status, code: error, message });
  }

  private takePendingHttpRequest(requestId: string, releaseBuffered = true): PendingHttpRequest | undefined {
    const request = this.pendingHttpRequests.get(requestId);
    if (!request) return undefined;
    this.pendingHttpRequests.delete(requestId);
    if (releaseBuffered) this.releaseBufferedHttpRequestBytes(request.bytes);
    return request;
  }

  private clearPendingHttpRequests(): void {
    const pendingBytes = [...this.pendingHttpRequests.values()].reduce((sum, request) => sum + request.bytes, 0);
    this.pendingHttpRequests.clear();
    this.releaseBufferedHttpRequestBytes(pendingBytes);
  }

  private abortActiveHttpForwards(reason: string): void {
    for (const controller of this.activeHttpForwards.values()) controller.abort(new Error(reason));
  }

  private releaseBufferedHttpRequestBytes(bytes: number): void {
    this.bufferedHttpRequestBytes = Math.max(0, this.bufferedHttpRequestBytes - bytes);
  }

  private fail(message: string): void {
    this.options.log?.(message);
    this.statusValue = { ...this.statusValue, state: "error", lastError: message };
  }
}

export function relayHostWebSocketOptions(hostToken: string): ClientOptions {
  return { headers: { authorization: `Bearer ${hostToken}` }, maxPayload: relayHostFrameMaxBytes };
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function withInviteToken(publicUrl: string, inviteToken?: string): string {
  const trimmed = inviteToken?.trim();
  if (!trimmed) return publicUrl;
  const url = new URL(`${publicUrl.replace(/\/+$/, "")}/join`);
  url.searchParams.set("invite", trimmed);
  return url.toString();
}

export function localRequestHeaders(headers: TunnelHeaders): TunnelHeaders {
  const clean: TunnelHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (["connection", "content-length", "host", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"].includes(lower) || lower.startsWith("sec-websocket-")) continue;
    clean[lower] = value;
  }
  return clean;
}

export function localHttpRequestOptions(method: string, headers: TunnelHeaders, body?: BodyInit, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: localRequestHeaders(headers),
    body: method === "GET" || method === "HEAD" ? undefined : body,
    redirect: "manual",
    ...(signal ? { signal } : {})
  };
}

export function localWebSocketProtocols(headers: TunnelHeaders): string[] {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === "sec-websocket-protocol")?.[1];
  if (!value) return [];
  return [...new Set(value.split(",").map((protocol) => protocol.trim()).filter((protocol) => /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/.test(protocol)))].slice(0, 16);
}

export function localWebSocketClientOptions(headers: TunnelHeaders): ClientOptions {
  return { headers, maxPayload: relayWebSocketMessageMaxBytes };
}

export function localWebSocketMessageBuffer(data: WebSocket.RawData, maxBytes = relayWebSocketMessageMaxBytes): Buffer {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("WebSocket message byte limit must be a non-negative safe integer");
  const body = rawDataToBuffer(data);
  if (body.byteLength > maxBytes) throw new Error(`Desktop backend WebSocket message exceeds ${maxBytes} bytes`);
  return body;
}

function rawDataToBuffer(data: WebSocket.RawData): Buffer {
  if (typeof data === "string") return Buffer.from(data, "utf8");
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function boundedWebSocketCloseReason(reason: string, maxBytes = 123): string {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("WebSocket close reason byte limit must be a non-negative safe integer");
  const encoder = new TextEncoder();
  let bounded = "";
  for (const character of reason) {
    const candidate = `${bounded}${character}`;
    if (encoder.encode(candidate).byteLength > maxBytes) break;
    bounded = candidate;
  }
  return bounded;
}

export async function readResponseBodyChunks(response: Response, maxBytes = relayHttpResponseMaxBytes): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  await streamResponseBodyChunks(response, (chunk) => {
    chunks.push(chunk);
  }, maxBytes);
  return chunks;
}

export async function streamResponseBodyChunks(
  response: Response,
  onChunk: (chunk: Buffer) => void | Promise<void>,
  maxBytes = relayHttpResponseMaxBytes,
  signal?: AbortSignal
): Promise<void> {
  if (!Number.isFinite(maxBytes) || maxBytes < 0) throw new Error("Relay response byte limit must be a non-negative finite number");
  const declaredLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    const error = new Error(`Relay response exceeds ${maxBytes} bytes`);
    await response.body?.cancel(error).catch(() => undefined);
    throw error;
  }
  const reader = response.body?.getReader();
  if (!reader) return;
  let totalBytes = 0;
  const onAbort = () => {
    void reader.cancel(signal?.reason).catch(() => undefined);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Relay response forwarding was aborted");
      const { done, value } = await reader.read();
      if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Relay response forwarding was aborted");
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) throw new Error(`Relay response exceeds ${maxBytes} bytes`);
      await onChunk(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

export function chunkBufferForTunnel(body: Buffer, frameBytes = relayHttpResponseFrameBytes): Buffer[] {
  if (!Number.isSafeInteger(frameBytes) || frameBytes <= 0) throw new Error("Tunnel frame size must be a positive safe integer");
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < body.length; offset += frameBytes) chunks.push(body.subarray(offset, offset + frameBytes));
  return chunks;
}
