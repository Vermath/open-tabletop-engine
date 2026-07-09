import { normalizeWebSocketCloseCode, parseTunnelFrameText, serializeTunnelFrame, type TunnelFrame, type TunnelHeaders } from "@open-tabletop/tunnel-protocol";
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
  resolve(response: Response): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
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
      return stub ? stub.fetch(doRequest(request, `/host${url.search}`)) : json({ error: "bad_table_slug" }, 400);
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
    return json(relayTableStatus({ slug: table.slug, expiresAt: table.expiresAt, hostConnected: Boolean(this.hostSocket) }));
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
    const previousHostSocket = this.hostSocket;
    this.hostSocket = server;
    previousHostSocket?.close(1012, "Host replaced by a newer tunnel connection");
    await this.renewTable(table);
    server.addEventListener("message", (event) => this.handleHostMessage(String(event.data)).catch((error) => this.closeHost(server, 1011, error.message)));
    server.addEventListener("close", () => this.closeHost(server, 1000, "Host disconnected"));
    server.addEventListener("error", () => this.closeHost(server, 1011, "Host socket error"));
    return new Response(null, { status: 101, webSocket: client });
  }

  private async proxyHttp(request: Request, path: string): Promise<Response> {
    const table = await this.table();
    if (!table) return json({ error: "unknown_table" }, 404);
    if (isExpired(table)) return json({ error: "table_expired" }, 410);
    if (!this.hostSocket) return json({ error: "host_offline" }, 503);
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > relayLimits.maxRequestBodyBytes) return json({ error: "request_too_large" }, 413);
    const bodyBytes = request.method === "GET" || request.method === "HEAD" ? new Uint8Array() : new Uint8Array(await request.arrayBuffer());
    if (bodyBytes.byteLength > relayLimits.maxRequestBodyBytes) return json({ error: "request_too_large" }, 413);
    const requestId = crypto.randomUUID();
    const responsePromise = this.waitForHttpResponse(requestId);
    this.sendHost({ type: "http.request", requestId, method: request.method, path: safeRelayPath(path), headers: requestHeaders(request.headers) });
    if (bodyBytes.byteLength > 0) this.sendHost({ type: "http.body", requestId, bodyBase64: bytesToBase64(bodyBytes) });
    this.sendHost({ type: "http.end", requestId });
    return responsePromise;
  }

  private async proxyWebSocket(request: Request, path: string): Promise<Response> {
    const table = await this.table();
    if (!table) return json({ error: "unknown_table" }, 404);
    if (isExpired(table)) return json({ error: "table_expired" }, 410);
    if (!this.hostSocket) return json({ error: "host_offline" }, 503);
    if (this.playerSockets.size >= relayLimits.maxClientWebSocketsPerTable) return json({ error: "too_many_websockets" }, 429);
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ error: "websocket_required" }, 426);
    const selectedProtocol = selectRelayWebSocketProtocol(request.headers.get("sec-websocket-protocol"));

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const socketId = crypto.randomUUID();
    server.accept();
    this.playerSockets.set(socketId, server);
    this.sendHost({ type: "ws.open", socketId, path: safeRelayPath(path), headers: requestHeaders(request.headers) });
    server.addEventListener("message", (event) => {
      const bytes = typeof event.data === "string" ? new TextEncoder().encode(event.data) : new Uint8Array(event.data as ArrayBuffer);
      this.sendHost({ type: "ws.message", socketId, bodyBase64: bytesToBase64(bytes) });
    });
    server.addEventListener("close", (event) => {
      this.playerSockets.delete(socketId);
      this.sendHost({ type: "ws.close", socketId, code: normalizeWebSocketCloseCode(event.code), reason: event.reason });
    });
    server.addEventListener("error", () => {
      this.playerSockets.delete(socketId);
      this.sendHost({ type: "ws.close", socketId, code: 1011, reason: "Relay client socket error" });
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
    if (frame.type === "http.body") {
      this.pendingHttp.get(frame.requestId)?.chunks.push(base64ToBytes(frame.bodyBase64));
      return;
    }
    if (frame.type === "http.end") {
      const pending = this.pendingHttp.get(frame.requestId);
      if (!pending?.response) return;
      clearTimeout(pending.timer);
      this.pendingHttp.delete(frame.requestId);
      const body = concatBytes(pending.chunks);
      pending.resolve(new Response(toArrayBuffer(body), { status: pending.response.status, headers: pending.response.headers }));
      return;
    }
    if (frame.type === "ws.message") {
      this.playerSockets.get(frame.socketId)?.send(base64ToBytes(frame.bodyBase64));
      return;
    }
    if (frame.type === "ws.close") {
      const socket = this.playerSockets.get(frame.socketId);
      socket?.close(normalizeWebSocketCloseCode(frame.code, 1000), frame.reason);
      this.playerSockets.delete(frame.socketId);
    }
  }

  private waitForHttpResponse(requestId: string): Promise<Response> {
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingHttp.delete(requestId);
        reject(new Error("Relay timed out waiting for desktop host response"));
      }, relayLimits.maxHttpWaitMs);
      this.pendingHttp.set(requestId, { chunks: [], resolve, reject, timer });
    });
  }

  private sendHost(frame: TunnelFrame): void {
    if (!this.hostSocket || this.hostSocket.readyState !== 1) throw new Error("Desktop host is not connected");
    this.hostSocket.send(serializeTunnelFrame(frame));
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
      pending.reject(new Error(reason));
    }
    this.pendingHttp.clear();
    const safeCode = normalizeWebSocketCloseCode(code);
    for (const socket of this.playerSockets.values()) socket.close(safeCode, reason);
    this.playerSockets.clear();
  }
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
  return new URL(request.url).searchParams.get("token") ?? undefined;
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
  return protocols.find((protocol) => protocol === "otte.v1") ?? protocols[0];
}

function safeRelayPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(path)) return "/";
  return path;
}

function isExpired(table: StoredTable): boolean {
  return Date.parse(table.expiresAt) <= Date.now();
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

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
