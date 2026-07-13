export interface AssetEdgeEnv {
  ASSET_ORIGIN_URL?: string;
  ASSET_URL_SIGNING_SECRET?: string;
  ASSET_EDGE_ROUTE_PREFIX?: string;
  ASSET_EDGE_MAX_TTL_SECONDS?: string;
}

type Fetcher = (request: Request, init?: RequestInit) => Promise<Response>;

interface EdgeFetchInit extends RequestInit {
  cf?: {
    cacheEverything?: boolean;
    cacheTtl?: number;
    cacheKey?: string;
  };
}

const ASSET_BLOB_PATH = /^\/api\/v1\/assets\/([^/]+)\/blob$/;
const FORWARDED_HEADERS = ["accept", "accept-language", "if-modified-since", "if-none-match", "range"];

export default {
  async fetch(request: Request, env: AssetEdgeEnv): Promise<Response> {
    return handleAssetEdgeRequest(request, env);
  }
};

export async function handleAssetEdgeRequest(request: Request, env: AssetEdgeEnv, fetcher: Fetcher = fetch, nowMs = Date.now()): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return edgeError(405, "method_not_allowed", "Asset edge only supports GET and HEAD requests", { allow: "GET, HEAD" });
  }

  const url = new URL(request.url);
  const path = edgeAssetPath(url.pathname, env.ASSET_EDGE_ROUTE_PREFIX);
  const match = ASSET_BLOB_PATH.exec(path);
  if (!match) return edgeError(404, "asset_edge_not_found", "Asset edge only serves signed asset blob routes");

  const assetId = match[1] ?? "";
  if (!/^[A-Za-z0-9_-]+$/.test(assetId)) return edgeError(400, "invalid_asset_id", "Asset id is not edge-cacheable");

  const disposition = url.searchParams.get("disposition") ?? "inline";
  if (disposition !== "inline" && disposition !== "attachment") {
    return edgeError(400, "invalid_asset_disposition", "Asset disposition must be inline or attachment");
  }

  const expiresAt = url.searchParams.get("expiresAt");
  const signature = url.searchParams.get("signature");
  if (!expiresAt || !signature) return edgeError(401, "missing_asset_signature", "Signed asset URL is required");

  const ttlSeconds = remainingTtlSeconds(expiresAt, nowMs, edgeMaxTtlSeconds(env.ASSET_EDGE_MAX_TTL_SECONDS));
  if (ttlSeconds <= 0) return edgeError(401, "expired_asset_signature", "Signed asset URL has expired");
  const signingSecret = env.ASSET_URL_SIGNING_SECRET?.trim();
  if (!signingSecret) return edgeError(500, "asset_edge_misconfigured", "Missing ASSET_URL_SIGNING_SECRET");
  if (!env.ASSET_ORIGIN_URL?.trim()) return edgeError(500, "asset_edge_misconfigured", "Missing ASSET_ORIGIN_URL");

  const expected = await createAssetEdgeSignature(assetId, expiresAt, disposition, signingSecret);
  if (!constantTimeEqual(expected, signature)) return edgeError(401, "invalid_asset_signature", "Signed asset URL is invalid");

  let originUrl: URL;
  try {
    originUrl = originAssetUrl(env.ASSET_ORIGIN_URL, path, url.search);
  } catch {
    return edgeError(500, "asset_edge_misconfigured", "ASSET_ORIGIN_URL must be an absolute URL");
  }
  const originHeaders = forwardedOriginHeaders(request.headers);
  originHeaders.set("x-otte-asset-edge", "cloudflare");
  const originRequest = new Request(originUrl.toString(), {
    method: request.method,
    headers: originHeaders
  });
  const rangeRequest = request.headers.has("range");
  const response = await fetcher(
    originRequest,
    rangeRequest
      ? undefined
      : ({
          cf: {
            cacheEverything: true,
            cacheTtl: ttlSeconds,
            cacheKey: edgeCacheKey(url, path)
          }
        } as EdgeFetchInit)
  );
  return edgeAssetResponse(response, ttlSeconds, !rangeRequest);
}

export async function createAssetEdgeSignature(assetId: string, expiresAt: string, disposition: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(JSON.stringify({ assetId, expiresAt, disposition })));
  return base64UrlEncode(new Uint8Array(signature));
}

function edgeAssetPath(pathname: string, routePrefix: string | undefined): string {
  const prefix = normalizeRoutePrefix(routePrefix);
  if (!prefix) return pathname;
  if (pathname === prefix) return "/";
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname;
}

function normalizeRoutePrefix(value: string | undefined): string {
  const trimmed = value?.trim().replace(/\/+$/, "") ?? "";
  if (!trimmed || trimmed === "/") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function originAssetUrl(originBase: string, path: string, search: string): URL {
  const origin = new URL(originBase.trim());
  const originPrefix = origin.pathname.replace(/\/+$/, "");
  origin.pathname = `${originPrefix}${path}`;
  origin.search = search;
  return origin;
}

function forwardedOriginHeaders(headers: Headers): Headers {
  const forwarded = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = headers.get(name);
    if (value) forwarded.set(name, value);
  }
  return forwarded;
}

function edgeAssetResponse(response: Response, ttlSeconds: number, cacheable: boolean): Response {
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  headers.set("x-otte-asset-edge", "validated");
  if (cacheable && (response.ok || response.status === 304)) {
    headers.set("cache-control", `public, max-age=${ttlSeconds}`);
  } else {
    headers.set("cache-control", "no-store");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function edgeError(status: number, error: string, message: string, extraHeaders: Record<string, string> = {}): Response {
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-otte-asset-edge": "rejected",
    ...extraHeaders
  });
  return new Response(JSON.stringify({ error, message }), { status, headers });
}

function remainingTtlSeconds(expiresAt: string, nowMs: number, maxTtlSeconds: number): number {
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) return 0;
  const remaining = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
  return Math.min(remaining, maxTtlSeconds);
}

function edgeMaxTtlSeconds(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 24 * 60 * 60) : 3600;
}

function edgeCacheKey(url: URL, path: string): string {
  const cacheUrl = new URL(url.toString());
  cacheUrl.pathname = path;
  cacheUrl.searchParams.delete("signature");
  return cacheUrl.toString();
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index++) {
    difference |= leftBytes[index]! ^ rightBytes[index]!;
  }
  return difference === 0;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
