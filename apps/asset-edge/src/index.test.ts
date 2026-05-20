import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAssetEdgeSignature, handleAssetEdgeRequest, type AssetEdgeEnv } from "./index.js";

const nowMs = Date.parse("2026-05-01T20:00:00.000Z");
const expiresAt = "2026-05-01T20:05:00.000Z";
const secret = "asset-edge-test-secret";
const env: AssetEdgeEnv = {
  ASSET_ORIGIN_URL: "https://api.example.test",
  ASSET_URL_SIGNING_SECRET: secret,
  ASSET_EDGE_ROUTE_PREFIX: "/otte",
  ASSET_EDGE_MAX_TTL_SECONDS: "120"
};

function apiSignature(assetId: string, disposition = "inline"): string {
  return createHmac("sha256", secret).update(`${assetId}:${expiresAt}:${disposition}`).digest("base64url");
}

describe("asset edge worker", () => {
  it("validates API signed asset URLs and proxies cacheable origin responses", async () => {
    const originRequests: { request: Request; init?: RequestInit }[] = [];
    const signature = apiSignature("asset_demo", "attachment");
    const request = new Request(`https://assets.example.test/otte/api/v1/assets/asset_demo/blob?expiresAt=${encodeURIComponent(expiresAt)}&signature=${signature}&disposition=attachment`, {
      headers: {
        authorization: "Bearer should-not-forward",
        cookie: "sid=should-not-forward"
      }
    });
    const response = await handleAssetEdgeRequest(
      request,
      env,
      async (originRequest, init) => {
        originRequests.push({ request: originRequest, init });
        return new Response("asset", {
          status: 200,
          headers: {
            "content-type": "image/png",
            "set-cookie": "bad=true"
          }
        });
      },
      nowMs
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("asset");
    expect(response.headers.get("cache-control")).toBe("public, max-age=120");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-otte-asset-edge")).toBe("validated");
    expect(originRequests).toHaveLength(1);
    expect(originRequests[0]!.request.url).toBe(`https://api.example.test/api/v1/assets/asset_demo/blob?expiresAt=${encodeURIComponent(expiresAt)}&signature=${signature}&disposition=attachment`);
    expect(originRequests[0]!.request.headers.get("authorization")).toBeNull();
    expect(originRequests[0]!.request.headers.get("cookie")).toBeNull();
    expect(originRequests[0]!.request.headers.get("range")).toBeNull();
    expect(originRequests[0]!.request.headers.get("x-otte-asset-edge")).toBe("cloudflare");
    expect((originRequests[0]!.init as { cf?: { cacheEverything?: boolean; cacheTtl?: number } }).cf).toMatchObject({
      cacheEverything: true,
      cacheTtl: 120
    });
  });

  it("forwards range requests without edge cache metadata or public cache headers", async () => {
    const originRequests: { request: Request; init?: RequestInit }[] = [];
    const signature = apiSignature("asset_demo");
    const response = await handleAssetEdgeRequest(
      new Request(`https://assets.example.test/api/v1/assets/asset_demo/blob?expiresAt=${encodeURIComponent(expiresAt)}&signature=${signature}`, {
        headers: { range: "bytes=0-4" }
      }),
      { ...env, ASSET_EDGE_ROUTE_PREFIX: "" },
      async (originRequest, init) => {
        originRequests.push({ request: originRequest, init });
        return new Response("asset", { status: 206 });
      },
      nowMs
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(originRequests[0]!.request.headers.get("range")).toBe("bytes=0-4");
    expect(originRequests[0]!.init).toBeUndefined();
  });

  it("rejects tampered signatures without calling origin", async () => {
    let called = false;
    const response = await handleAssetEdgeRequest(
      new Request(`https://assets.example.test/api/v1/assets/asset_demo/blob?expiresAt=${encodeURIComponent(expiresAt)}&signature=tampered`),
      { ...env, ASSET_EDGE_ROUTE_PREFIX: "" },
      async () => {
        called = true;
        return new Response("unreachable");
      },
      nowMs
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(called).toBe(false);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_asset_signature" });
  });

  it("rejects expired signatures and non-blob routes before origin fetch", async () => {
    const signature = await createAssetEdgeSignature("asset_demo", "2026-05-01T19:59:00.000Z", "inline", secret);
    let called = false;
    const expired = await handleAssetEdgeRequest(
      new Request(`https://assets.example.test/api/v1/assets/asset_demo/blob?expiresAt=2026-05-01T19%3A59%3A00.000Z&signature=${signature}`),
      { ...env, ASSET_EDGE_ROUTE_PREFIX: "" },
      async () => {
        called = true;
        return new Response("unreachable");
      },
      nowMs
    );
    const missing = await handleAssetEdgeRequest(new Request("https://assets.example.test/api/v1/campaigns/camp_demo/assets"), env, async () => new Response("unreachable"), nowMs);

    expect(expired.status).toBe(401);
    expect(missing.status).toBe(404);
    expect(called).toBe(false);
  });

  it("does not cache non-successful origin responses", async () => {
    const signature = apiSignature("asset_demo");
    const response = await handleAssetEdgeRequest(
      new Request(`https://assets.example.test/api/v1/assets/asset_demo/blob?expiresAt=${encodeURIComponent(expiresAt)}&signature=${signature}`),
      { ...env, ASSET_EDGE_ROUTE_PREFIX: "" },
      async () => new Response(JSON.stringify({ error: "asset_deleted" }), { status: 410, headers: { "content-type": "application/json" } }),
      nowMs
    );

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-otte-asset-edge")).toBe("validated");
  });

  it("preserves an API origin path prefix when proxying", async () => {
    const signature = apiSignature("asset_demo");
    let originUrl = "";
    await handleAssetEdgeRequest(
      new Request(`https://assets.example.test/api/v1/assets/asset_demo/blob?expiresAt=${encodeURIComponent(expiresAt)}&signature=${signature}`),
      { ...env, ASSET_EDGE_ROUTE_PREFIX: "", ASSET_ORIGIN_URL: "https://origin.example.test/tabletop" },
      async (request) => {
        originUrl = request.url;
        return new Response("asset");
      },
      nowMs
    );

    expect(originUrl).toBe(`https://origin.example.test/tabletop/api/v1/assets/asset_demo/blob?expiresAt=${encodeURIComponent(expiresAt)}&signature=${signature}`);
  });
});
