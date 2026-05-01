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

The API persists campaign state to SQLite at `storage/opentabletop.sqlite` by default. Local non-Docker API runs store uploaded map assets under `OTTE_UPLOAD_DIR` unless `OTTE_ASSET_STORAGE=s3` is configured. Docker Compose defaults uploaded assets to MinIO with bucket `opentabletop-assets`, endpoint `http://minio:9000`, and path-style S3 access. The SQLite file lives in the `api-storage` volume; the `api-uploads` volume remains available for local-storage fallback. AI threads use `OTTE_AI_PROVIDER=local-echo` unless configured otherwise. `OTTE_AI_PROVIDER=codex-loopback` is available as a deterministic local Codex App Server adapter smoke test. `OTTE_AI_PROVIDER=openai-responses` enables the OpenAI Responses API adapter and requires `OPENAI_API_KEY`; optional provider settings are `OPENAI_MODEL`, `OPENAI_BASE_URL`, `OPENAI_ORGANIZATION`, and `OPENAI_PROJECT`.

OIDC SSO is optional. Set `OTTE_OIDC_ISSUER`, `OTTE_OIDC_CLIENT_ID`, optional `OTTE_OIDC_CLIENT_SECRET`, and an externally reachable `OTTE_OIDC_REDIRECT_URI` ending in `/api/v1/auth/oidc/callback`. Set `OTTE_WEB_ORIGIN` or `OTTE_OIDC_ALLOWED_RETURN_ORIGINS` to the browser origin that should receive the callback token.

Production auth operations are API-backed. Set `OTTE_ADMIN_USER_IDS` to a comma-separated list of user ids that can call `/api/v1/admin/*`. Password reset requests create hashed `opr_` reset tokens and outbox email records; set `OTTE_PASSWORD_RESET_URL` to the browser reset screen, usually `https://your-web-origin/reset-password`, and set `OTTE_EMAIL_WEBHOOK_URL` plus optional `OTTE_EMAIL_WEBHOOK_TOKEN` to deliver messages through your mail bridge. Without a webhook, reset messages remain visible to server admins through `/api/v1/admin/email-outbox`. Server admins can export redacted account/session audit records from `/api/v1/admin/audit-logs` as JSON or NDJSON with filters. Legacy `x-user-id` auth is disabled outside tests unless `OTTE_ALLOW_LEGACY_USER_HEADER=true` is explicitly set.

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
OTTE_ASSET_CLEANUP_GRACE_DAYS=7
```

Uploaded map bytes pass through the built-in asset scanner before local or S3 storage writes. EICAR test signatures, active SVG content, executable/script uploads, and HTML uploads are rejected with `422 asset_security_blocked`; clean uploads store scanner metadata on the asset record. `OTTE_ASSET_QUOTA_BYTES` applies per campaign to active and archived assets. `OTTE_ASSET_RETENTION_DAYS` assigns a default asset expiry when new assets are created. Set `OTTE_ASSET_CDN_BASE_URL` when a CDN fronts the API blob route; signed delivery URLs use that base URL and require `OTTE_ASSET_URL_SIGNING_SECRET` in production. `OTTE_ASSET_CLEANUP_GRACE_DAYS` controls the default wait before cleanup jobs physically remove deleted or expired asset bytes. Campaign owners can inspect campaign usage at `/api/v1/campaigns/{campaignId}/assets/storage`, request signed delivery at `/api/v1/assets/{assetId}/delivery-url`, and archive or delete assets through `/api/v1/assets/{assetId}/lifecycle`. Server admins can inspect global usage at `/api/v1/admin/assets/storage`, migrate readable assets to the active storage provider with `/api/v1/admin/assets/migrate`, and remove deleted or expired object bytes with `/api/v1/admin/assets/cleanup`.

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
