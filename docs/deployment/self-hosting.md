# Self-Hosting

Run the full local stack:

```bash
cp .env.example .env
pnpm install
docker compose up --build
```

If the default host ports are already in use, override them before starting Compose:

```bash
API_PORT=4480 \
WEB_PORT=5183 \
POSTGRES_PORT=55432 \
REDIS_PORT=56379 \
MINIO_API_PORT=9900 \
MINIO_CONSOLE_PORT=9901 \
VITE_API_URL=http://localhost:4480 \
docker compose up --build
```

Services:

- Web: `http://localhost:5173`
- API: `http://localhost:4000`
- MinIO console: `http://localhost:9001`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

The API persists campaign state to SQLite at `storage/opentabletop.sqlite` by default. Local non-Docker API runs store uploaded map assets under `OTTE_UPLOAD_DIR` unless `OTTE_ASSET_STORAGE=s3` is configured. Docker Compose defaults uploaded assets to MinIO with bucket `opentabletop-assets`, endpoint `http://minio:9000`, and path-style S3 access. The SQLite file lives in the `api-storage` volume; the `api-uploads` volume remains available for local-storage fallback. AI threads use `OTTE_AI_PROVIDER=local-echo` unless configured otherwise. `OTTE_AI_PROVIDER=codex-loopback` is available as a deterministic local Codex App Server adapter smoke test. `OTTE_AI_PROVIDER=openai-responses` enables the OpenAI Responses API adapter and requires `OPENAI_API_KEY`; optional provider settings are `OPENAI_MODEL`, `OPENAI_BASE_URL`, `OPENAI_ORGANIZATION`, and `OPENAI_PROJECT`. `OTTE_AI_PROVIDER_RETRY_ATTEMPTS` controls the pre-event provider retry budget and defaults to `1`, clamped from `0` to `3`. `OTTE_AI_INPUT_TOKEN_COST_USD_PER_1K` and `OTTE_AI_OUTPUT_TOKEN_COST_USD_PER_1K` are optional non-negative rates used to estimate thread and campaign AI costs from provider-reported token usage. Server admins can inspect redacted provider runtime settings, aggregate AI usage, failures, and tool activity at `/api/v1/admin/ai/operations` and in the browser Admin tab.

OIDC SSO is optional. Set `OTTE_OIDC_ISSUER`, `OTTE_OIDC_CLIENT_ID`, optional `OTTE_OIDC_CLIENT_SECRET`, and an externally reachable `OTTE_OIDC_REDIRECT_URI` ending in `/api/v1/auth/oidc/callback`. Set `OTTE_WEB_ORIGIN` or `OTTE_OIDC_ALLOWED_RETURN_ORIGINS` to the browser origin that should receive the callback token.

Production auth operations are API-backed. Set `OTTE_ADMIN_USER_IDS` to a comma-separated list of user ids that can call `/api/v1/admin/*`. Set `OTTE_SCIM_BEARER_TOKEN` to enable bearer-protected SCIM v2 user and group provisioning at `/api/v1/scim/v2/*`; server admins can map SCIM groups into campaign roles through `/api/v1/admin/scim/group-role-mappings`. Password reset requests create hashed `opr_` reset tokens and outbox email records; set `OTTE_PASSWORD_RESET_URL` to the browser reset screen, usually `https://your-web-origin/reset-password`, and set `OTTE_EMAIL_WEBHOOK_URL` plus optional `OTTE_EMAIL_WEBHOOK_TOKEN` to deliver messages through your mail bridge. Without a webhook, reset messages remain visible to server admins through `/api/v1/admin/email-outbox`. Local password users can enable TOTP MFA with one-time recovery codes through `/api/v1/auth/mfa/*`; OIDC deployments can keep using the identity provider's own MFA policy. Server admins can export redacted account/session/SCIM audit records from `/api/v1/admin/audit-logs` as JSON or NDJSON with filters. Legacy `x-user-id` auth is disabled outside tests unless `OTTE_ALLOW_LEGACY_USER_HEADER=true` is explicitly set.

Plugin trust policy is optional for local development and should be enabled for production plugin installs. The default `OTTE_PLUGIN_TRUST_POLICY=allow_unsigned` reports plugin trust status but permits unsigned local packages. Set `OTTE_PLUGIN_TRUST_POLICY=require_trusted` and configure `OTTE_PLUGIN_TRUST_KEYS` as either JSON (`{"trusted-local":"secret"}`) or comma-separated `key=secret` pairs to block unsigned packages and packages whose `plugin.signature.json` no longer matches the manifest and server-entrypoint checksums. Trusted-only mode blocks both installation and command execution for non-installable plugins. Set `OTTE_PLUGIN_REGISTRY_URLS` to a comma-separated allowlist of remote registry catalog URLs when GMs should be able to sync distributed plugin packages through `POST /api/v1/plugins/registry/sync`; downloaded registry packages are mirrored into the configured plugin root, record registry provenance in catalog source metadata, refuse to overwrite existing local package directories without matching registry provenance, and still pass through the same manifest, sandbox, versioning, and trust-policy checks as local packages. `OTTE_PLUGIN_REGISTRY_TIMEOUT_MS` controls registry fetch timeouts and defaults to 5000 milliseconds.

The worker app can process a single JSON job from stdin against a running API:

```bash
OTTE_API_URL=http://127.0.0.1:4000 OTTE_USER_ID=usr_demo_gm pnpm --filter @open-tabletop/worker exec tsx src/index.ts < job.json
```

Supported worker job types are `campaign.export`, `campaign.import`, `asset.storage.migrate`, `asset.storage.cleanup`, `ai.memory.extract`, and `ai.session.recap`. Use `OTTE_SESSION_TOKEN` for bearer-session auth in production-like runs; `OTTE_USER_ID` is available for local compatibility with the API's development auth path. Asset migration and cleanup jobs call server-admin API routes, so the bearer session must belong to a user listed in `OTTE_ADMIN_USER_IDS`.

Asset storage configuration:

```bash
OTTE_ASSET_STORAGE=s3
OTTE_S3_ENDPOINT=http://minio:9000
OTTE_S3_BUCKET=opentabletop-assets
OTTE_S3_REGION=us-east-1
OTTE_S3_ACCESS_KEY_ID=opentabletop
OTTE_S3_SECRET_ACCESS_KEY=opentabletop-dev
OTTE_S3_FORCE_PATH_STYLE=true
OTTE_ASSET_QUOTA_BYTES=1073741824
OTTE_ASSET_RETENTION_DAYS=30
OTTE_ASSET_CDN_BASE_URL=https://assets.example.com
OTTE_ASSET_URL_SIGNING_SECRET=replace-with-random-secret
OTTE_ASSET_URL_TTL_SECONDS=300
OTTE_ASSET_URL_MAX_TTL_SECONDS=3600
OTTE_ASSET_TRUST_WEBHOOK_URL=https://scanner.example.com/asset-scan
OTTE_ASSET_TRUST_WEBHOOK_TOKEN=replace-with-scanner-token
OTTE_ASSET_TRUST_TIMEOUT_MS=5000
OTTE_ASSET_TRUST_FAIL_CLOSED=true
OTTE_ASSET_TRUST_SCANNER_NAME=external-asset-scanner
OTTE_ASSET_CLEANUP_GRACE_DAYS=7
OTTE_ASSET_CLEANUP_INTERVAL_SECONDS=3600
```

Uploaded map bytes pass through the built-in asset scanner before local or S3 storage writes. EICAR test signatures, active SVG content, executable/script uploads, and HTML uploads are rejected with `422 asset_security_blocked`; clean uploads store scanner metadata on the asset record. For higher-assurance hosting, set `OTTE_ASSET_TRUST_WEBHOOK_URL` to call an external AV/trust scanner after the built-in scanner passes and before any asset row or object byte is written. The webhook receives JSON with `name`, `mimeType`, `sizeBytes`, `checksum`, and `contentBase64`; optional `OTTE_ASSET_TRUST_WEBHOOK_TOKEN` is sent as a bearer token. Scanner responses must return `status: "clean"` or `status: "blocked"` plus optional `scanner` and `findings`; blocked responses, high-severity findings, invalid responses, HTTP failures, or timeouts reject the upload by default. Set `OTTE_ASSET_TRUST_FAIL_CLOSED=false` only for deployments that explicitly prefer fail-open behavior during scanner outages. `OTTE_ASSET_QUOTA_BYTES` applies per campaign to active and archived assets. `OTTE_ASSET_RETENTION_DAYS` assigns a default asset expiry when new assets are created. Set `OTTE_ASSET_CDN_BASE_URL` when a CDN fronts the API blob route; signed delivery URLs use that base URL and require `OTTE_ASSET_URL_SIGNING_SECRET` in production. `apps/asset-edge` provides a Cloudflare Worker edge configuration for those signed URLs; see [Asset Edge Worker](./asset-edge.md). `OTTE_ASSET_CLEANUP_GRACE_DAYS` controls the default wait before cleanup jobs physically remove deleted or expired asset bytes, and `OTTE_ASSET_CLEANUP_INTERVAL_SECONDS` enables API-hosted recurring cleanup. Campaign owners can inspect campaign usage at `/api/v1/campaigns/{campaignId}/assets/storage`, request signed delivery at `/api/v1/assets/{assetId}/delivery-url`, and archive or delete assets through `/api/v1/assets/{assetId}/lifecycle`. Server admins can inspect global usage at `/api/v1/admin/assets/storage`, migrate readable assets to the active storage provider with `/api/v1/admin/assets/migrate`, and remove deleted or expired object bytes with `/api/v1/admin/assets/cleanup`.

For local development without Docker:

```bash
pnpm --filter @open-tabletop/api dev
pnpm --filter @open-tabletop/web dev
```

Direct API calls must include an authenticated bearer session token:

```bash
OTTE_SESSION_TOKEN="$(curl -sS -X POST \
  -H "content-type: application/json" \
  --data '{"userId":"usr_demo_gm"}' \
  http://localhost:4000/api/v1/auth/login | jq -r .token)"

curl -H "Authorization: Bearer $OTTE_SESSION_TOKEN" http://localhost:4000/api/v1/campaigns
```

Admin operations require a bearer session for one of the ids in `OTTE_ADMIN_USER_IDS`:

```bash
OTTE_ADMIN_SESSION_TOKEN="$(curl -sS -X POST \
  -H "content-type: application/json" \
  --data '{"userId":"usr_demo_gm"}' \
  http://localhost:4000/api/v1/auth/login | jq -r .token)"

curl -H "Authorization: Bearer $OTTE_ADMIN_SESSION_TOKEN" http://localhost:4000/api/v1/admin/users

curl -X POST \
  -H "Authorization: Bearer $OTTE_ADMIN_SESSION_TOKEN" \
  http://localhost:4000/api/v1/admin/users/usr_demo_player/password-reset
```

Campaign archives are JSON `.ottx` files. The import endpoint upserts every archive collection, including users, members, scenes, assets, tokens, actors, journals, encounters, combats, AI memory, audit logs, and permission grants. Uploaded asset files are embedded as base64 archive `files` entries with size and `sha256` checksums; import validates and restores them through the active asset storage provider.

Raw image uploads can be assigned directly to a scene background:

```bash
curl -X POST \
  -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  -H "content-type: image/png" \
  -H "x-asset-name: vault.png" \
  --data-binary @vault.png \
  "http://localhost:4000/api/v1/campaigns/camp_demo/assets/upload?sceneId=scn_vault_entry&setAsBackground=true"
```

Signed asset delivery for CDN or browser contexts:

```bash
curl -X POST \
  -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  -H "content-type: application/json" \
  --data '{"expiresInSeconds":300,"disposition":"inline"}' \
  "http://localhost:4000/api/v1/assets/asset_.../delivery-url"
```
