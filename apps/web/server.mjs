import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("./", import.meta.url));
const root = fileURLToPath(new URL("./dist/", import.meta.url));
const assetRoot = join(root, "assets");
const indexFile = join(root, "index.html");
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 4173);
const defaultRailwayApiUrl = "http://open-tabletopapi.railway.internal:8080";
const apiBaseUrl = process.env.OTTE_API_URL ?? process.env.VITE_API_URL ?? (process.env.NODE_ENV === "production" ? defaultRailwayApiUrl : undefined);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"]
]);

await ensureStaticBuild();

const server = createServer(async (request, response) => {
  if (apiBaseUrl && request.url?.startsWith("/api/")) {
    proxyApiRequest(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { allow: "GET, HEAD" });
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  const filePath = await resolveStaticPath(url.pathname);
  const headers = {
    "content-type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
    "cache-control": filePath.startsWith(assetRoot) ? "public, max-age=31536000, immutable" : "no-cache"
  };
  response.writeHead(200, headers);
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(filePath)
    .on("error", (error) => {
      console.error(`Failed to stream static file ${filePath}:`, error);
      response.destroy(error);
    })
    .pipe(response);
});

server.listen(port, host, () => {
  console.log(`open-tabletop-web listening on http://${host}:${port}`);
  if (apiBaseUrl) console.log(`open-tabletop-web proxying /api to ${redactUrl(apiBaseUrl)}`);
});

server.on("upgrade", (request, socket, head) => {
  if (!apiBaseUrl || !request.url?.startsWith("/api/")) {
    socket.destroy();
    return;
  }
  proxyApiUpgrade(request, socket, head);
});

async function resolveStaticPath(pathname) {
  let decoded;
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
      // Fall through to SPA fallback.
    }
  }
  return indexFile;
}

async function ensureStaticBuild() {
  if (existsSync(indexFile)) return;
  console.warn("Static web bundle is missing; running vite build before starting.");
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(pnpm, ["exec", "vite", "build"], {
    cwd: appRoot,
    env: process.env,
    stdio: "inherit"
  });
  if (result.status !== 0 || !existsSync(indexFile)) {
    throw new Error(`Static web bundle missing and startup build failed with status ${result.status ?? "unknown"}.`);
  }
}

function proxyApiRequest(request, response) {
  const target = targetUrl(request.url ?? "/");
  const headers = proxyHeaders(request, target);
  const client = target.protocol === "https:" ? https : http;
  const proxy = client.request(target, { method: request.method, headers }, (proxyResponse) => {
    response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
    proxyResponse.pipe(response);
  });
  proxy.on("error", (error) => {
    if (!response.headersSent) response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "bad_gateway", message: `API proxy failed: ${error.message}` }));
  });
  request.pipe(proxy);
}

function proxyApiUpgrade(request, socket, head) {
  const target = targetUrl(request.url ?? "/");
  const headers = proxyHeaders(request, target);
  const client = target.protocol === "https:" ? https : http;
  const proxy = client.request(target, { method: request.method, headers });
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

function targetUrl(requestUrl) {
  const base = new URL(apiBaseUrl);
  return new URL(requestUrl, `${base.protocol}//${base.host}`);
}

function proxyHeaders(request, target) {
  return {
    ...request.headers,
    host: target.host,
    "x-forwarded-host": request.headers.host ?? "",
    "x-forwarded-proto": request.headers["x-forwarded-proto"] ?? "https"
  };
}

function redactUrl(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  return url.toString().replace(/\/$/, "");
}
