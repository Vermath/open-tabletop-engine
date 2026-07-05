import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import http, { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import https from "node:https";
import { extname, join, normalize } from "node:path";
import type { Duplex } from "node:stream";

export interface WebStaticRuntimeOptions {
  host?: string;
  port?: number;
  root: string;
  apiBaseUrl?: string;
}

export interface WebStaticRuntime {
  host: string;
  port: number;
  url: string;
  close(): Promise<void>;
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json"],
  [".map", "application/json"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

export async function startWebStaticRuntime(options: WebStaticRuntimeOptions): Promise<WebStaticRuntime> {
  if (!existsSync(join(options.root, "index.html"))) throw new Error(`Static web bundle missing index.html: ${options.root}`);
  const host = options.host ?? "0.0.0.0";
  const port = options.port ?? 4173;
  const server = createServer((request, response) => {
    void handleStaticRequest(server, options, request, response).catch((error) => {
      if (!response.headersSent) response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "static_runtime_error", message: error instanceof Error ? error.message : "Unknown error" }));
    });
  });
  server.on("upgrade", (request, socket, head) => {
    if (!options.apiBaseUrl || !request.url?.startsWith("/api/")) {
      socket.destroy();
      return;
    }
    proxyApiUpgrade(options.apiBaseUrl, request, socket, head);
  });
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Web runtime did not bind to a TCP port");
  const boundHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return {
    host: boundHost,
    port: address.port,
    url: `http://${boundHost}:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

async function handleStaticRequest(_server: Server, options: WebStaticRuntimeOptions, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (options.apiBaseUrl && request.url?.startsWith("/api/")) {
    proxyApiRequest(options.apiBaseUrl, request, response);
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }
  const url = new URL(request.url ?? "/", "http://localhost");
  const filePath = await resolveStaticPath(options.root, url.pathname);
  response.writeHead(200, {
    "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
    "cache-control": filePath.includes(`${normalize("/assets/")}`) ? "public, max-age=31536000, immutable" : "no-cache"
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath).pipe(response);
}

async function resolveStaticPath(root: string, pathname: string): Promise<string> {
  let decoded = "/";
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return join(root, "index.html");
  }
  const normalized = normalize(decoded).replace(/^[/\\]+/, "").replace(/^(\.\.[/\\])+/, "");
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

function proxyApiRequest(apiBaseUrl: string, request: IncomingMessage, response: ServerResponse): void {
  const target = targetUrl(apiBaseUrl, request.url ?? "/");
  const client = target.protocol === "https:" ? https : http;
  const proxy = client.request(target, { method: request.method, headers: proxyHeaders(request, target) }, (proxyResponse) => {
    response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
    proxyResponse.pipe(response);
  });
  proxy.on("error", (error) => {
    if (!response.headersSent) response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "bad_gateway", message: `API proxy failed: ${error.message}` }));
  });
  request.pipe(proxy);
}

function proxyApiUpgrade(apiBaseUrl: string, request: IncomingMessage, socket: Duplex, head: Buffer): void {
  const target = targetUrl(apiBaseUrl, request.url ?? "/");
  const client = target.protocol === "https:" ? https : http;
  const proxy = client.request(target, { method: request.method, headers: proxyHeaders(request, target) });
  proxy.on("upgrade", (proxyResponse, proxySocket, proxyHead) => {
    socket.write(`HTTP/${proxyResponse.httpVersion} ${proxyResponse.statusCode} ${proxyResponse.statusMessage}\r\n`);
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

function proxyHeaders(request: IncomingMessage, target: URL): IncomingMessage["headers"] {
  return {
    ...request.headers,
    host: target.host,
    "x-forwarded-host": request.headers.host ?? "",
    "x-forwarded-proto": request.headers["x-forwarded-proto"] ?? "https"
  };
}
