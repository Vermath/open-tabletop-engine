import { Buffer } from "node:buffer";
import WebSocket from "ws";
import { normalizeWebSocketCloseCode, parseTunnelFrameText, serializeTunnelFrame, tunnelFrameSchemaVersion, type TunnelFrame, type TunnelHeaders } from "@open-tabletop/tunnel-protocol";

export interface RelayTunnelSessionOptions {
  relayBaseUrl: string;
  localWebBaseUrl: string;
  inviteToken?: string;
  log?: (message: string) => void;
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
}

interface LocalWebSocketTunnel {
  socket: WebSocket;
  opened: boolean;
  queuedMessages: Buffer[];
  queuedBytes: number;
}

export const relayHttpResponseFrameBytes = 256 * 1024;
export const relayHttpResponseMaxBytes = 64 * 1024 * 1024;
const localWebSocketOpenQueueMaxMessages = 64;
const localWebSocketOpenQueueMaxBytes = 1024 * 1024;

export class RelayTunnelSession {
  private relaySocket: WebSocket | null = null;
  private readonly pendingHttpRequests = new Map<string, PendingHttpRequest>();
  private readonly localSockets = new Map<string, LocalWebSocketTunnel>();
  private statusValue: RelayTunnelSessionStatus;

  constructor(private readonly options: RelayTunnelSessionOptions) {
    this.statusValue = { state: "starting", relayBaseUrl: normalizeBaseUrl(options.relayBaseUrl) };
  }

  status(): RelayTunnelSessionStatus {
    return { ...this.statusValue };
  }

  async start(): Promise<RelayTunnelSessionStatus> {
    try {
      const table = await this.createTable();
      this.statusValue = {
        state: "starting",
        relayBaseUrl: normalizeBaseUrl(this.options.relayBaseUrl),
        tableSlug: table.slug,
        publicUrl: table.publicUrl,
        inviteUrl: withInviteToken(table.publicUrl, this.options.inviteToken)
      };
      await this.connectHostSocket(table);
      this.statusValue = { ...this.statusValue, state: "connected" };
      return this.status();
    } catch (error) {
      this.statusValue = { ...this.statusValue, state: "error", lastError: errorMessage(error) };
      throw error;
    }
  }

  async stop(): Promise<void> {
    for (const local of this.localSockets.values()) local.socket.close(1000, "Desktop sharing stopped");
    this.localSockets.clear();
    this.pendingHttpRequests.clear();
    if (this.relaySocket && this.relaySocket.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve) => {
        this.relaySocket?.once("close", () => resolve());
        this.relaySocket?.close(1000, "Desktop sharing stopped");
        setTimeout(resolve, 500);
      });
    }
    this.relaySocket = null;
    this.statusValue = { ...this.statusValue, state: "stopped" };
  }

  private async createTable(): Promise<RelayTableResponse> {
    const response = await fetch(`${normalizeBaseUrl(this.options.relayBaseUrl)}/v1/tables`, { method: "POST" });
    if (!response.ok) throw new Error(`Relay table creation failed with ${response.status}`);
    return (await response.json()) as RelayTableResponse;
  }

  private async connectHostSocket(table: RelayTableResponse): Promise<void> {
    const socketUrl = new URL(`${normalizeBaseUrl(this.options.relayBaseUrl)}/v1/hosts/${table.slug}`);
    socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
    socketUrl.searchParams.set("token", table.hostToken);
    const socket = new WebSocket(socketUrl);
    this.relaySocket = socket;
    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    socket.on("message", (data) => this.handleRelayMessage(data).catch((error) => this.fail(`Tunnel frame failed: ${errorMessage(error)}`)));
    socket.on("close", () => {
      if (this.statusValue.state === "connected") this.statusValue = { ...this.statusValue, state: "stopped" };
      this.pendingHttpRequests.clear();
      for (const local of this.localSockets.values()) local.socket.close(1011, "Relay disconnected");
      this.localSockets.clear();
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
        this.pendingHttpRequests.set(frame.requestId, { method: frame.method, path: frame.path, headers: frame.headers, chunks: [] });
        return;
      case "http.body":
        this.pendingHttpRequests.get(frame.requestId)?.chunks.push(Buffer.from(frame.bodyBase64, "base64"));
        return;
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
    const request = this.pendingHttpRequests.get(requestId);
    this.pendingHttpRequests.delete(requestId);
    if (!request) return;
    try {
      const body = request.chunks.length > 0 ? Buffer.concat(request.chunks) : undefined;
      const response = await fetch(new URL(request.path, this.options.localWebBaseUrl), {
        method: request.method,
        headers: localRequestHeaders(request.headers),
        body: request.method === "GET" || request.method === "HEAD" ? undefined : body
      });
      const headers: TunnelHeaders = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      const responseBodyChunks = await readResponseBodyChunks(response);
      this.sendFrame({ type: "http.response", requestId, status: response.status, headers });
      for (const chunk of responseBodyChunks) {
        for (const frameChunk of chunkBufferForTunnel(chunk)) {
          this.sendFrame({ type: "http.body", requestId, bodyBase64: frameChunk.toString("base64") });
        }
      }
      this.sendFrame({ type: "http.end", requestId });
    } catch (error) {
      const body = Buffer.from(JSON.stringify({ error: "desktop_tunnel_bad_gateway", message: errorMessage(error) }));
      this.sendFrame({ type: "http.response", requestId, status: 502, headers: { "content-type": "application/json; charset=utf-8" } });
      this.sendFrame({ type: "http.body", requestId, bodyBase64: body.toString("base64") });
      this.sendFrame({ type: "http.end", requestId });
    }
  }

  private openLocalWebSocket(frame: Extract<TunnelFrame, { type: "ws.open" }>): void {
    const target = new URL(frame.path, this.options.localWebBaseUrl);
    target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
    const protocols = localWebSocketProtocols(frame.headers);
    const headers = localRequestHeaders(frame.headers);
    const localSocket = protocols.length > 0 ? new WebSocket(target, protocols, { headers }) : new WebSocket(target, { headers });
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
        this.closeLocalWebSocket(frame.socketId, 1011, errorMessage(error).slice(0, 120));
      }
    });
    localSocket.on("message", (data) => {
      if (this.localSockets.get(frame.socketId)?.socket !== localSocket) return;
      const body = rawDataToBuffer(data);
      this.sendFrame({ type: "ws.message", socketId: frame.socketId, bodyBase64: body.toString("base64") });
    });
    localSocket.on("close", (code, reason) => {
      if (this.localSockets.get(frame.socketId)?.socket !== localSocket) return;
      this.localSockets.delete(frame.socketId);
      this.sendFrame({ type: "ws.close", socketId: frame.socketId, code: normalizeWebSocketCloseCode(code), reason: reason.toString("utf8") });
    });
    localSocket.on("error", (error) => {
      if (this.localSockets.get(frame.socketId)?.socket !== localSocket) return;
      this.closeLocalWebSocket(frame.socketId, 1011, errorMessage(error).slice(0, 120));
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

  private fail(message: string): void {
    this.options.log?.(message);
    this.statusValue = { ...this.statusValue, state: "error", lastError: message };
  }
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

export function localWebSocketProtocols(headers: TunnelHeaders): string[] {
  const value = Object.entries(headers).find(([key]) => key.toLowerCase() === "sec-websocket-protocol")?.[1];
  if (!value) return [];
  return [...new Set(value.split(",").map((protocol) => protocol.trim()).filter((protocol) => /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/.test(protocol)))].slice(0, 16);
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

export async function readResponseBodyChunks(response: Response, maxBytes = relayHttpResponseMaxBytes): Promise<Buffer[]> {
  const declaredLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error(`Relay response exceeds ${maxBytes} bytes`);
  const reader = response.body?.getReader();
  if (!reader) return [];
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.byteLength === 0) continue;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) throw new Error(`Relay response exceeds ${maxBytes} bytes`);
    chunks.push(Buffer.from(value));
  }
  return chunks;
}

export function chunkBufferForTunnel(body: Buffer, frameBytes = relayHttpResponseFrameBytes): Buffer[] {
  if (frameBytes <= 0) throw new Error("Tunnel frame size must be positive");
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < body.length; offset += frameBytes) chunks.push(body.subarray(offset, offset + frameBytes));
  return chunks;
}
