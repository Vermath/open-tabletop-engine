# Asset Edge Worker

`apps/asset-edge` is a Cloudflare Worker that fronts `GET /api/v1/assets/{assetId}/blob` signed URLs.

The worker validates the same JSON-serialized HMAC payload as the API (`JSON.stringify({ assetId, expiresAt, disposition })`), rejects expired or tampered URLs before origin fetch, strips browser credentials before proxying, and returns cache headers bounded by the signed URL expiry. It forwards the browser `Origin` header so the API's explicit `OTTE_CORS_ALLOWED_ORIGINS` policy can authorize image fetches used by board capture; credentials and cookies are never forwarded. The API still validates the signature at origin, so the edge layer is a cache and origin-protection layer rather than the only authorization check.

Configure the API to mint CDN URLs:

```bash
OTTE_ASSET_CDN_BASE_URL=https://assets.example.com
OTTE_ASSET_URL_SIGNING_SECRET=replace-with-random-secret
OTTE_ASSET_URL_TTL_SECONDS=300
OTTE_ASSET_URL_MAX_TTL_SECONDS=3600
OTTE_CORS_ALLOWED_ORIGINS=https://tabletop.example.com
```

Configure the Worker:

```bash
cd apps/asset-edge
pnpm exec wrangler secret put ASSET_URL_SIGNING_SECRET
pnpm exec wrangler deploy
```

Set Worker variables in `apps/asset-edge/wrangler.jsonc` or in the Cloudflare dashboard:

| Variable | Purpose |
| --- | --- |
| `ASSET_ORIGIN_URL` | Public API origin used for proxied blob fetches, for example `https://api.example.com`. |
| `ASSET_URL_SIGNING_SECRET` | Secret matching `OTTE_ASSET_URL_SIGNING_SECRET`; configure it as a Worker secret. |
| `ASSET_EDGE_ROUTE_PREFIX` | Optional route prefix to strip before proxying, for example `/otte` when `OTTE_ASSET_CDN_BASE_URL=https://assets.example.com/otte`. |
| `ASSET_EDGE_MAX_TTL_SECONDS` | Edge cache TTL ceiling. Defaults to `3600` and is still capped by each signed URL expiry. |

The production web runtime reads the same `OTTE_ASSET_CDN_BASE_URL`, reduces it to its exact origin, and adds only that origin to CSP `connect-src`. This lets `html-to-image` fetch CDN-backed map and token images without permitting arbitrary outbound browser connections. Remote HTTP, credential-bearing URLs, and wildcard hosts fail web startup.

Validation commands:

```bash
pnpm --filter @open-tabletop/asset-edge test
pnpm --filter @open-tabletop/asset-edge typecheck
```
