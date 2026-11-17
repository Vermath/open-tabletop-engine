import { normalizeWebSocketCloseCode, parseTunnelFrameText, serializeTunnelFrame, validateTunnelPath, type TunnelFrame, type TunnelHeaders } from "@open-tabletop/tunnel-protocol";
import { createRelayTable, hostTokenHash, MemoryRateLimiter, relayLimits, relayTableStatus, requestIp, verifyHostTokenHash, type RelayTableRecord } from "./relay-core.js";

export interface RelayEnv {
  TABLE_TUNNEL: DurableObjectNamespace;
  PUBLIC_BASE_URL?: string;
}

interface StoredTable {
  slug: string;
  hostTokenHash: string;
  publicUrl: string;
  expiresAt: string;
}

interface PendingHttpResponse {
  response?: Extract<TunnelFrame, { type: "http.response" }>;
  chunks: Uint8Array[];
  bytes: number;
  method: string;
  resolve(response: Response): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

class RelayHttpResponseError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const rateLimiter = new MemoryRateLimiter({ windowMs: relayLimits.rateLimitWindowMs, maxRequests: relayLimits.maxRequestsPerWindow });

export default {
  async fetch(request: Request, env: RelayEnv): Promise<Response> {
    const rateLimit = rateLimiter.check(requestIp(request));
    if (!rateLimit.allowed) {
      return json({ error: "rate_limited" }, 429, { "retry-after": String(Math.ceil(rateLimit.retryAfterMs / 1000)) });
    }
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/v1/tables") return createTable(request, env);

    const hostMatch = /^\/v1\/hosts\/([^/]+)$/.exec(url.pathname);
    if (hostMatch) {
      const stub = maybeTableStub(env, hostMatch[1]!);
      return stub ? stub.fetch(doRequest(request, "/host")) : json({ error: "bad_table_slug" }, 400);
    }

    const statusMatch = /^\/v1\/tables\/([^/]+)\/status$/.exec(url.pathname);
    if (request.method === "GET" && statusMatch) {
      const stub = maybeTableStub(env, statusMatch[1]!);
      return stub ? stub.fetch(new Request("https://table.internal/status")) : json({ error: "bad_table_slug" }, 400);
    }

    const tableMatch = /^\/t\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (tableMatch) {
      const slug = tableMatch[1]!;
      const stub = maybeTableStub(env, slug);
      if (!stub) return json({ error: "bad_table_slug" }, 400);
      const localPath = `${tableMatch[2] ?? "/"}${url.search}`;
      const endpoint = request.headers.get("upgrade")?.toLowerCase() === "websocket" ? "/ws" : "/http";
      const proxied = doRequest(request, `${endpoint}?path=${encodeURIComponent(localPath)}`);
      return stub.fetch(proxied);
    }

    return json({ error: "not_found" }, 404);
  }
};

export class TableTunnel {
  private hostSocket: WebSocket | undefined;
  private readonly pendingHttp = new Map<string, PendingHttpResponse>();
  private bufferedHttpRequestBytes = 0;
  private bufferedHttpResponseBytes = 0;
  private activeHttpRequests = 0;
  private readonly playerSockets = new Map<string, WebSocket>();

  constructor(private readonly state: DurableObjectState, private readonly env: RelayEnv) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/internal/create") return this.create(request);
    if (request.method === "GET" && url.pathname === "/status") return this.status();
    if (url.pathname === "/host") return this.acceptHost(request);
    if (url.pathname === "/http") return this.proxyHttp(request, url.searchParams.get("path") ?? "/");
    if (url.pathname === "/ws") return this.proxyWebSocket(request, url.searchParams.get("path") ?? "/");
    return json({ error: "not_found" }, 404);
  }

  private async create(request: Request): Promise<Response> {
    const table = (await request.json()) as StoredTable;
    await this.state.storage.put("table", table);
    return json({ ok: true }, 201);
  }

  private async status(): Promise<Response> {
    const table = await this.table();
    if (!table) return json({ error: "unknown_table" }, 404);
    return json(relayTableStatus({ slug: table.slug, expiresAt: table.expiresAt, hostConnected: this.hostConnected() }));
  }

  private async acceptHost(request: Request): Promise<Response> {
    const table = await this.table();
    if (!table) return json({ error: "unknown_table" }, 404);
    if (isExpired(table)) return json({ error: "table_expired" }, 410);
    const token = hostTokenFromRequest(request);
    if (!token || !(await verifyHostTokenHash(token, table.hostTokenHash))) return json({ error: "bad_host_token" }, 401);
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "websocket_required" }, 426);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    this.replaceHostSocket(server);
    await this.renewTable(table);
    server.addEventListener("message", (event) => {
      if (this.hostSocket !== server) return;
      this.handleHostMessage(String(event.data)).catch((error) => this.closeHost(server, 1011, error.message));
    });
    server.addEventListener("close", () => this.closeHost(server, 1000, "Host disconnected"));
    server.addEventListener("error", () => this.closeHost(server, 1011, "Host socket error"));
    return new Response(null, { status: 101, webSocket: client });
  }

  private async proxyHttp(request: Request, path: string): Promise<Response> {
    const table = await this.table();
    if (!table) return json({ error: "unknown_table" }, 404);
    if (isExpired(table)) return json({ error: "table_expired" }, 410);
    if (!this.hostConnected()) return json({ error: "host_offline" }, 503);
    let tunnelPath: string;
    try {
      tunnelPath = safeRelayPath(path);
    } catch {
      return json({ error: "bad_tunnel_path" }, 400);
    }
    if (this.activeHttpRequests >= relayLimits.maxPendingHttpRequestsPerTable || this.pendingHttp.size >= relayLimits.maxPendingHttpRequestsPerTable) {
      return json({ error: "too_many_http_requests" }, 429);
    }
    this.activeHttpRequests += 1;
    let reservedRequestBytes = 0;
    try {
      const declaredLength = Number(request.headers.get("content-length") ?? "0");
      if (declaredLength > relayLimits.maxRequestBodyBytes) return json({ error: "request_too_large" }, 413);
      const body = request.method === "GET" || request.method === "HEAD"
        ? { chunks: [] as Uint8Array[], tooLarge: false, capacityExceeded: false }
        : await readBoundedRequestBody(request, relayLimits.maxRequestBodyBytes, (bytes) => {
            if (this.bufferedHttpRequestBytes + bytes > relayLimits.maxBufferedHttpRequestBytesPerTable) return false;
            this.bufferedHttpRequestBytes += bytes;
            reservedRequestBytes += bytes;
            return true;
          });
      if (body.tooLarge) return json({ error: "request_too_large" }, 413);
      if (body.capacityExceeded) return json({ error: "request_buffer_full" }, 429);
      const requestId = crypto.randomUUID();
      const responsePromise = this.waitForHttpResponse(requestId, request.method);
      try {
        this.sendHost({ type: "http.request", requestId, method: request.method, path: tunnelPath, headers: requestHeaders(request.headers) });
        for (const chunk of body.chunks) this.sendHost({ type: "http.body", requestId, bodyBase64: bytesToBase64(chunk) });
        this.sendHost({ type: "http.end", requestId });
      } catch {
        this.discardPendingHttpResponse(requestId, new RelayHttpResponseError(503, "host_offline", "Desktop host is not connected"));
        void responsePromise.catch(() => undefined);
        return json({ error: "host_offline" }, 503);
      }
      try {
        return await responsePromise;
      } catch (error) {
        if (error instanceof RelayHttpResponseError) return json({ error: error.code }, error.status);
        throw error;
      }
    } finally {
      this.bufferedHttpRequestBytes = Math.max(0, this.bufferedHttpRequestBytes - reservedRequestBytes);
      this.activeHttpRequests = Math.max(0, this.activeHttpRequests - 1);
    }
  }

  private async proxyWebSocket(request: Request, path: string): Promise<Response> {
    const table = await this.table();
    if (!table) return json({ error: "unknown_table" }, 404);
    if (isExpired(table)) return json({ error: "table_expired" }, 410);
    if (!this.hostConnected()) return json({ error: "host_offline" }, 503);
    let tunnelPath: string;
    try {
      tunnelPath = safeRelayPath(path);
    } catch {
      return json({ error: "bad_tunnel_path" }, 400);
    }
    if (this.playerSockets.size >= relayLimits.maxClientWebSocketsPerTable) return json({ error: "too_many_websockets" }, 429);
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "websocket_required" }, 426);
    const selectedProtocol = selectRelayWebSocketProtocol(request.headers.get("sec-websocket-protocol"));

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const socketId = crypto.randomUUID();
    server.accept();
    try {
      this.sendHost({ type: "ws.open", socketId, path: tunnelPath, headers: requestHeaders(request.headers) });
    } catch {
      server.close(1011, "Desktop host is not connected");
      return json({ error: "host_offline" }, 503);
    }
    this.playerSockets.set(socketId, server);
    server.addEventListener("message", (event) => {
      this.handlePlayerWebSocketMessage(socketId, server, event.data as string | ArrayBuffer);
    });
    server.addEventListener("close", (event) => {
      this.playerSockets.delete(socketId);
      this.trySendHost({ type: "ws.close", socketId, code: normalizeWebSocketCloseCode(event.code), reason: event.reason });
    });
    server.addEventListener("error", () => {
      this.playerSockets.delete(socketId);
      this.trySendHost({ type: "ws.close", socketId, code: 1011, reason: "Relay client socket error" });
    });
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: selectedProtocol ? { "sec-websocket-protocol": selectedProtocol } : undefined
    });
  }

  private async handleHostMessage(text: string): Promise<void> {
    const frame = parseTunnelFrameText(text);
    if (frame.type === "host.hello" || frame.type === "control.ping") {
      const table = await this.table();
      if (table) await this.renewTable(table);
      return;
    }
    if (frame.type === "http.response") {
      const pending = this.pendingHttp.get(frame.requestId);
      if (pending) pending.response = frame;
      return;
    }
    if (frame.type === "http.error") {
      const pending = this.takePendingHttpResponse(frame.requestId);
      pending?.resolve(json({ error: frame.code, message: frame.message }, frame.status));
      return;
    }
    if (frame.type === "http.body") {
      const pending = this.pendingHttp.get(frame.requestId);
      if (!pending) return;
      const chunk = base64ToBytes(frame.bodyBase64);
      if (
        pending.bytes + chunk.byteLength > relayLimits.maxHttpResponseBodyBytes ||
        this.bufferedHttpResponseBytes + chunk.byteLength > relayLimits.maxBufferedHttpResponseBytesPerTable
      ) {
        const rejected = this.takePendingHttpResponse(frame.requestId);
        rejected?.resolve(json({ error: "host_response_too_large" }, 502));
        return;
      }
      pending.chunks.push(chunk);
      pending.bytes += chunk.byteLength;
      this.bufferedHttpResponseBytes += chunk.byteLength;
      return;
    }
    if (frame.type === "http.end") {
      const pending = this.takePendingHttpResponse(frame.requestId, false);
      if (!pending) return;
      if (!pending.response) {
        this.releaseBufferedHttpResponseBytes(pending.bytes);
        pending.resolve(json({ error: "invalid_host_response" }, 502));
        return;
      }
      const responseBody = pending.method === "HEAD" || responseStatusForbidsBody(pending.response.status)
        ? null
        : this.bufferedHttpResponseStream(pending.chunks, pending.bytes);
      if (responseBody === null) this.releaseBufferedHttpResponseBytes(pending.bytes);
      try {
        pending.resolve(new Response(responseBody, { status: pending.response.status, headers: pending.response.headers }));
      } catch {
        if (responseBody) void responseBody.cancel().catch(() => undefined);
        pending.resolve(json({ error: "invalid_host_response" }, 502));
      }
      return;
    }
    if (frame.type === "ws.message") {
      const socket = this.playerSockets.get(frame.socketId);
      if (!socket) return;
      const body = base64ToBytes(frame.bodyBase64);
      if (body.byteLength > relayLimits.maxClientWebSocketMessageBytes) {
        this.playerSockets.delete(frame.socketId);
        socket.close(1009, "Desktop host message is too large");
        return;
      }
      socket.send(body);
      return;
    }
    if (frame.type === "ws.close") {
      const socket = this.playerSockets.get(frame.socketId);
      socket?.close(normalizeWebSocketCloseCode(frame.code, 1000), frame.reason);
      this.playerSockets.delete(frame.socketId);
    }
  }

  private waitForHttpResponse(requestId: string, method: string): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.takePendingHttpResponse(requestId);
        pending?.reject(new RelayHttpResponseError(504, "host_response_timeout", "Relay timed out waiting for desktop host response"));
      }, relayLimits.maxHttpWaitMs);
      this.pendingHttp.set(requestId, { chunks: [], bytes: 0, method, resolve, reject, timer });
    });
  }

  private discardPendingHttpResponse(requestId: string, error: Error): void {
    this.takePendingHttpResponse(requestId)?.reject(error);
  }

  private takePendingHttpResponse(requestId: string, releaseBuffered = true): PendingHttpResponse | undefined {
    const pending = this.pendingHttp.get(requestId);
    if (!pending) return undefined;
    clearTimeout(pending.timer);
    this.pendingHttp.delete(requestId);
    if (releaseBuffered) this.releaseBufferedHttpResponseBytes(pending.bytes);
    return pending;
  }

  private bufferedHttpResponseStream(chunks: Uint8Array[], totalBytes: number): ReadableStream<Uint8Array> {
    let index = 0;
    let remainingBytes = totalBytes;
    const release = (bytes: number) => {
      const released = Math.min(bytes, remainingBytes);
      remainingBytes -= released;
      this.releaseBufferedHttpResponseBytes(released);
    };
    return new ReadableStream<Uint8Array>({
      pull: (controller) => {
        const chunk = chunks[index];
        if (!chunk) {
          release(remainingBytes);
          chunks.length = 0;
          controller.close();
          return;
        }
        chunks[index] = new Uint8Array(0);
        index += 1;
        release(chunk.byteLength);
        controller.enqueue(chunk);
        if (index >= chunks.length) {
          chunks.length = 0;
          controller.close();
        }
      },
      cancel: () => {
        chunks.length = 0;
        release(remainingBytes);
      }
    }, { highWaterMark: 0 });
  }

  private releaseBufferedHttpResponseBytes(bytes: number): void {
    this.bufferedHttpResponseBytes = Math.max(0, this.bufferedHttpResponseBytes - bytes);
  }

  private hostConnected(): boolean {
    return this.hostSocket?.readyState === 1;
  }

  private replaceHostSocket(socket: WebSocket): void {
    const previous = this.hostSocket;
    if (previous) {
      this.closeHost(previous, 1012, "Host replaced by a newer tunnel connection");
    }
    this.hostSocket = socket;
  }

  private sendHost(frame: TunnelFrame): void {
    const socket = this.hostSocket;
    if (!socket || socket.readyState !== 1) throw new Error("Desktop host is not connected");
    try {
      socket.send(serializeTunnelFrame(frame));
    } catch (error) {
      this.closeHost(socket, 1011, "Host socket send failed");
      throw error;
    }
  }

  private trySendHost(frame: TunnelFrame): void {
    if (!this.hostConnected()) return;
    try {
      this.sendHost(frame);
    } catch {
      // sendHost closes the failed host connection and all dependent player sockets.
    }
  }

  private handlePlayerWebSocketMessage(socketId: string, socket: WebSocket, data: string | ArrayBuffer): void {
    if (this.playerSockets.get(socketId) !== socket) return;
    const body = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
    if (body.byteLength > relayLimits.maxClientWebSocketMessageBytes) {
      this.playerSockets.delete(socketId);
      socket.close(1009, "Relay client message is too large");
      this.trySendHost({ type: "ws.close", socketId, code: 1009, reason: "Relay client message is too large" });
      return;
    }
    this.trySendHost({ type: "ws.message", socketId, bodyBase64: bytesToBase64(body) });
  }

  private async table(): Promise<StoredTable | undefined> {
    return this.state.storage.get<StoredTable>("table");
  }

  private async renewTable(table: StoredTable): Promise<void> {
    table.expiresAt = new Date(Date.now() + relayLimits.tableTtlMs).toISOString();
    await this.state.storage.put("table", table);
  }

  private closeHost(socket: WebSocket, code: number, reason: string): void {
    if (this.hostSocket !== socket) return;
    this.hostSocket = undefined;
    for (const pending of this.pendingHttp.values()) {
      clearTimeout(pending.timer);
      this.releaseBufferedHttpResponseBytes(pending.bytes);
      pending.reject(new RelayHttpResponseError(502, "host_disconnected", reason));
    }
    this.pendingHttp.clear();
    const safeCode = normalizeWebSocketCloseCode(code);
    const closeReason = boundedWebSocketCloseReason(reason);
    if (socket.readyState < 2) {
      try {
        socket.close(safeCode, closeReason);
      } catch {
        // The socket may have transitioned to closed between the state check and close.
      }
    }
    for (const socket of this.playerSockets.values()) {
      try {
        socket.close(safeCode, closeReason);
      } catch {
        // Continue closing the remaining dependent sockets.
      }
    }
    this.playerSockets.clear();
  }
}

function boundedWebSocketCloseReason(reason: string): string {
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const character of reason) {
    const characterBytes = encoder.encode(character).byteLength;
    if (bytes + characterBytes > 123) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

async function createTable(request: Request, env: RelayEnv): Promise<Response> {
  const publicBaseUrl = env.PUBLIC_BASE_URL ?? new URL(request.url).origin;
  const table: RelayTableRecord = createRelayTable({ publicBaseUrl });
  await tableStub(env, table.slug).fetch(
    new Request("https://table.internal/internal/create", {
      method: "POST",
      body: JSON.stringify({
        slug: table.slug,
        publicUrl: table.publicUrl,
        expiresAt: table.expiresAt,
        hostTokenHash: await hostTokenHash(table.hostToken)
      } satisfies StoredTable)
    })
  );
  return json(table, 201);
}

function tableStub(env: RelayEnv, slug: string): DurableObjectStub {
  if (!/^tbl_[a-zA-Z0-9_-]{20,}$/.test(slug)) throw new Error("Invalid table slug");
  return env.TABLE_TUNNEL.get(env.TABLE_TUNNEL.idFromName(slug));
}

function maybeTableStub(env: RelayEnv, slug: string): DurableObjectStub | undefined {
  return /^tbl_[a-zA-Z0-9_-]{20,}$/.test(slug) ? tableStub(env, slug) : undefined;
}

function doRequest(source: Request, path: string): Request {
  return new Request(`https://table.internal${path}`, source);
}

function hostTokenFromRequest(request: Request): string | undefined {
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice("bearer ".length).trim();
  return undefined;
}

function requestHeaders(headers: Headers): TunnelHeaders {
  const result: TunnelHeaders = {};
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (
      ["cf-connecting-ip", "cf-ipcountry", "cf-ray", "connection", "content-length", "host", "upgrade"].includes(lower) ||
      (lower.startsWith("sec-websocket-") && lower !== "sec-websocket-protocol")
    )
      continue;
    result[lower] = value;
  }
  return result;
}

export function selectRelayWebSocketProtocol(value: string | null): string | undefined {
  if (!value) return undefined;
  const protocols = value
    .split(",")
    .map((protocol) => protocol.trim())
    .filter((protocol) => /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/.test(protocol));
  return protocols.find((protocol) => protocol === "otte.v1") ?? protocols.find((protocol) => !protocol.startsWith("otte.auth."));
}

export function safeRelayPath(path: string): string {
  return validateTunnelPath(path);
}

function isExpired(table: StoredTable): boolean {
  return Date.parse(table.expiresAt) <= Date.now();
}

function responseStatusForbidsBody(status: number): boolean {
  return status === 204 || status === 205 || status === 304;
}

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
  reserve: (bytes: number) => boolean
): Promise<{ chunks: Uint8Array[]; tooLarge: boolean; capacityExceeded: boolean }> {
  const reader = request.body?.getReader();
  if (!reader) return { chunks: [], tooLarge: false, capacityExceeded: false };
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return { chunks, tooLarge: false, capacityExceeded: false };
      if (!value || value.byteLength === 0) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("Relay request body limit exceeded");
        return { chunks: [], tooLarge: true, capacityExceeded: false };
      }
      if (!reserve(value.byteLength)) {
        await reader.cancel("Relay aggregate request body limit exceeded");
        return { chunks: [], tooLarge: false, capacityExceeded: true };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}
