import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http, {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import https from "node:https";
import type { Socket } from "node:net";
import { extname, join, normalize, relative, sep } from "node:path";
import type { Duplex } from "node:stream";

export interface WebStaticRuntimeOptions {
  host?: string;
  port?: number;
  root: string;
  apiBaseUrl?: string;
  assetCdnBaseUrl?: string;
  closeTimeoutMs?: number;
}

export interface WebStaticRuntime {
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

export function configuredAssetCdnOrigin(value: string | undefined): string | undefined {
  const configured = value?.trim();
  if (!configured) return undefined;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("OTTE_ASSET_CDN_BASE_URL must be an absolute HTTP(S) URL");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.hostname.includes("*")) {
    throw new Error("OTTE_ASSET_CDN_BASE_URL must be a credential-free, non-wildcard HTTP(S) URL");
  }
  const loopbackHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  if (url.protocol !== "https:" && !loopbackHttp) {
    throw new Error("OTTE_ASSET_CDN_BASE_URL must use HTTPS outside loopback development");
  }
  return url.origin;
}

export function createWebContentSecurityPolicy(assetCdnBaseUrl?: string): string {
  const assetCdnOrigin = configuredAssetCdnOrigin(assetCdnBaseUrl);
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${assetCdnOrigin ? ` ${assetCdnOrigin}` : ""}`,
    "worker-src 'self' blob:",
  ].join("; ");
}

export const webContentSecurityPolicy = createWebContentSecurityPolicy();

export function createWebSecurityHeaders(assetCdnBaseUrl?: string): Record<string, string> {
  return {
  "content-security-policy": createWebContentSecurityPolicy(assetCdnBaseUrl),
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  };
}

export const webSecurityHeaders = createWebSecurityHeaders();
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json"],
  [".map", "application/json"],
  [".mp3", "audio/mpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
]);

export async function startWebStaticRuntime(
  options: WebStaticRuntimeOptions,
): Promise<WebStaticRuntime> {
  if (!existsSync(join(options.root, "index.html")))
    throw new Error(`Static web bundle missing index.html: ${options.root}`);
  const host = options.host ?? "0.0.0.0";
  const port = options.port ?? 4173;
  const sockets = new Set<Socket>();
  const securityHeaders = createWebSecurityHeaders(options.assetCdnBaseUrl);
  const server = createServer((request, response) => {
    void handleStaticRequest(server, options, request, response, sockets, securityHeaders).catch(
      (error) => {
        console.error("Static web request failed", error);
        if (!response.headersSent)
          response.writeHead(500, { ...securityHeaders, "content-type": "application/json" });
        response.end(
          JSON.stringify({
            error: "static_runtime_error",
            message: "Static web request failed",
          }),
        );
      },
    );
  });
  server.on("connection", (socket) => {
    trackStaticRuntimeSocket(sockets, socket);
  });
  server.on("upgrade", (request, socket, head) => {
    if (!options.apiBaseUrl || !request.url?.startsWith("/api/")) {
      socket.destroy();
      return;
    }
    proxyApiUpgrade(options.apiBaseUrl, request, socket, head, sockets);
  });
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Web runtime did not bind to a TCP port");
  const boundHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  let closePromise: Promise<void> | undefined;
  return {
    host: boundHost,
    port: address.port,
    url: `http://${boundHost}:${address.port}`,
    close: () =>
      (closePromise ??= closeStaticServer(
        server,
        sockets,
        options.closeTimeoutMs ?? 1_000,
      )),
  };
}

function closeStaticServer(
  server: Server,
  sockets: Set<Socket>,
  timeoutMs: number,
): Promise<void> {
  const boundedTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(0, Math.floor(timeoutMs))
    : 1_000;
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(forceCloseTimer);
      if (error) reject(error);
      else resolve();
    };
    const forceCloseTimer = setTimeout(() => {
      for (const socket of sockets) socket.destroy();
      finish();
    }, boundedTimeoutMs);
    server.close((error) => finish(error ?? undefined));
    server.closeIdleConnections?.();
  });
}

function trackStaticRuntimeSocket(sockets: Set<Socket>, socket: Socket): void {
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
}

async function handleStaticRequest(
  _server: Server,
  options: WebStaticRuntimeOptions,
  request: IncomingMessage,
  response: ServerResponse,
  sockets: Set<Socket>,
  securityHeaders: Record<string, string>,
): Promise<void> {
  if (options.apiBaseUrl && request.url?.startsWith("/api/")) {
    proxyApiRequest(options.apiBaseUrl, request, response, sockets, securityHeaders);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { ...securityHeaders, allow: "GET, HEAD" });
    response.end();
    return;
  }
  const url = new URL(request.url ?? "/", "http://localhost");
  const filePath = await resolveStaticPath(options.root, url.pathname);
  response.writeHead(200, {
    ...securityHeaders,
    "content-type":
      contentTypes.get(extname(filePath)) ?? "application/octet-stream",
    "cache-control": staticCacheControl(options.root, filePath),
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

export function staticCacheControl(root: string, filePath: string): string {
  const assetPath = relative(join(root, "assets"), filePath);
  const isDirectAsset =
    assetPath.length > 0 &&
    !assetPath.startsWith("..") &&
    !assetPath.includes(sep);
  const isFingerprinted =
    isDirectAsset && /-[A-Za-z0-9_-]{8,}\.[^.]+$/.test(assetPath);
  return isFingerprinted ? "public, max-age=31536000, immutable" : "no-cache";
}

async function resolveStaticPath(
  root: string,
  pathname: string,
): Promise<string> {
  let decoded = "/";
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return join(root, "index.html");
  }
  const normalized = normalize(decoded)
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const requested = join(root, normalized);
  if (requested.startsWith(root)) {
    try {
      const candidate = await stat(requested);
      if (candidate.isFile()) return requested;
    } catch {
      // SPA fallback.
    }
  }
  return join(root, "index.html");
}

function proxyApiRequest(
  apiBaseUrl: string,
  request: IncomingMessage,
  response: ServerResponse,
  sockets: Set<Socket>,
  securityHeaders: Record<string, string>,
): void {
  const target = targetUrl(apiBaseUrl, request.url ?? "/");
  const client = target.protocol === "https:" ? https : http;
  const proxy = client.request(
    target,
    { method: request.method, headers: proxyHeaders(request, target) },
    (proxyResponse) => {
      response.writeHead(
        proxyResponse.statusCode ?? 502,
        { ...proxyResponse.headers, ...securityHeaders },
      );
      proxyResponse.pipe(response);
    },
  );
  proxy.on("socket", (proxySocket) =>
    trackStaticRuntimeSocket(sockets, proxySocket),
  );
  proxy.on("error", (error) => {
    if (response.destroyed) return;
    console.error("API proxy request failed", error);
    if (!response.headersSent)
      response.writeHead(502, {
        ...securityHeaders,
        "content-type": "application/json; charset=utf-8",
      });
    response.end(
      JSON.stringify({
        error: "bad_gateway",
        message: "API proxy request failed",
      }),
    );
  });
  request.pipe(proxy);
}

function proxyApiUpgrade(
  apiBaseUrl: string,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  sockets: Set<Socket>,
): void {
  const target = targetUrl(apiBaseUrl, request.url ?? "/");
  const client = target.protocol === "https:" ? https : http;
  const proxy = client.request(target, {
    method: request.method,
    headers: proxyHeaders(request, target),
  });
  proxy.on("socket", (proxySocket) =>
    trackStaticRuntimeSocket(sockets, proxySocket),
  );
  proxy.on("upgrade", (proxyResponse, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/${proxyResponse.httpVersion} ${proxyResponse.statusCode} ${proxyResponse.statusMessage}\r\n`,
    );
    for (const [name, value] of Object.entries(proxyResponse.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) socket.write(`${name}: ${item}\r\n`);
      } else if (value !== undefined) {
        socket.write(`${name}: ${value}\r\n`);
      }
    }
    socket.write("\r\n");
    if (proxyHead.length > 0) socket.write(proxyHead);
    if (head.length > 0) proxySocket.write(head);
    proxySocket.pipe(socket).pipe(proxySocket);
  });
  proxy.on("error", () => socket.destroy());
  proxy.end();
}

function targetUrl(apiBaseUrl: string, requestUrl: string): URL {
  const base = new URL(apiBaseUrl);
  return new URL(requestUrl, `${base.protocol}//${base.host}`);
}

function proxyHeaders(
  request: IncomingMessage,
  target: URL,
): IncomingMessage["headers"] {
  return {
    ...request.headers,
    host: target.host,
    "x-forwarded-host": request.headers.host ?? "",
    "x-forwarded-proto": request.headers["x-forwarded-proto"] ?? ("encrypted" in request.socket ? "https" : "http"),
  };
}
