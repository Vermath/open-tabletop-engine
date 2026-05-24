import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const assetRoot = join(root, "assets");
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 4173);

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

const server = createServer(async (request, response) => {
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
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`open-tabletop-web listening on http://${host}:${port}`);
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
  return join(root, "index.html");
}
