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

Audio/video traffic is intentionally not proxied through the OpenTabletop API. Use a dedicated RTC provider or media stack and share room links through campaign-visible journal/chat/onboarding surfaces; see [Audio and Video Integrations](./audio-video-integrations.md).

The API persists campaign state to SQLite at `storage/opentabletop.sqlite` by default. Local non-Docker API runs store uploaded map assets under `OTTE_UPLOAD_DIR` unless `OTTE_ASSET_STORAGE=s3` is configured. Docker Compose defaults uploaded assets to MinIO with bucket `opentabletop-assets`, endpoint `http://minio:9000`, and path-style S3 access. The SQLite file lives in the `api-storage` volume; the `api-uploads` volume remains available for local-storage fallback.

AI threads use `OTTE_AI_PROVIDER=local-echo` unless configured otherwise. `OTTE_AI_PROVIDER=codex-loopback` is available as a deterministic local Codex App Server adapter smoke test. `OTTE_AI_PROVIDER=codex-app-server` connects to a live Codex app-server WebSocket, defaulting to `OTTE_CODEX_APP_SERVER_URL=ws://127.0.0.1:4500`; start that listener with `codex app-server --listen ws://127.0.0.1:4500` after Codex authentication has completed. `OTTE_CODEX_APP_SERVER_CWD`, `OTTE_CODEX_MODEL`, `OTTE_CODEX_IMAGE_MODEL`, and `OTTE_CODEX_MODEL_PROVIDER` optionally override the Codex working directory and model selection. For Docker Compose, remember that `127.0.0.1` inside the API container is the container itself; run the app-server on a host-reachable listener and set `OTTE_CODEX_APP_SERVER_URL` to that reachable WebSocket endpoint. OpenAI-backed text and image generation are routed through Codex app-server only; the API runtime does not read `OPENAI_API_KEY` or expose direct OpenAI API-key provider settings. Real AI map/token image generation uses Codex app-server `imageGeneration` items and fails visibly if the app-server is unavailable, unauthenticated, lacks image-generation capability, or returns no image bytes. `OTTE_AI_PROVIDER_RETRY_ATTEMPTS` controls the pre-event provider retry budget and defaults to `1`, clamped from `0` to `3`. `OTTE_AI_IMAGE_PROVIDER_TIMEOUT_MS` defaults to `240000` for generated art. `OTTE_AI_INPUT_TOKEN_COST_USD_PER_1K` and `OTTE_AI_OUTPUT_TOKEN_COST_USD_PER_1K` are optional non-negative rates used to estimate thread and campaign AI costs from provider-reported token usage. Server admins can inspect redacted provider runtime settings, aggregate AI usage, failures, and tool activity at `/api/v1/admin/ai/operations` and in the browser Admin tab.

The API applies an in-process fixed-window per-route caller rate limit when `OTTE_RATE_LIMIT_ENABLED=true`; it is enabled by default when `NODE_ENV=production`. `OTTE_RATE_LIMIT_WINDOW_SECONDS` defaults to `60`, and `OTTE_RATE_LIMIT_MAX_REQUESTS` defaults to `600`. Throttled requests return `429` with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`. For multi-node deployments, keep this runtime limiter enabled as a local guard and put a shared edge/load-balancer limiter in front of the API.

Server admins can inspect SQLite persistence with `GET /api/v1/admin/storage/operations`. The response reports the JSON-record storage model, applied migrations, required indexes, SQLite integrity-check result, record counts by collection, latest backup status, and scheduled-backup status without exposing host filesystem paths. Use `POST /api/v1/admin/storage/backup` before upgrades or risky maintenance to create a timestamped SQLite backup under the storage volume's `backups` directory, then run `POST /api/v1/admin/storage/restore-drill` to copy the backup into a temporary SQLite store and verify that it opens, migrates, passes integrity checks, and loads campaign records. Set `OTTE_SQLITE_BACKUP_RUN_ON_START=true` to create a backup when the API starts, `OTTE_SQLITE_BACKUP_INTERVAL_SECONDS` to run periodic backups, and optional `OTTE_SQLITE_BACKUP_REASON` to label scheduled backup audit rows.

SQLite v1 support boundary:

- The supported self-hosted v1 persistence mode is a single API writer using the SQLite JSON-record store.
- `engine_records` and `schema_migrations` are internal tables. Operators should not edit them directly; use REST APIs, campaign archives, SQLite backups, and documented restore procedures.
- SQLite backups are same-deployment operational recovery artifacts. Campaign `.ottx` archives are the portable campaign interchange format.
- The API applies forward SQLite migrations at startup. There is no in-place SQL rollback; rollback means stopping the API and restoring the last known-good SQLite, asset, plugin, and environment snapshots.
- The JSON record shape may gain new optional fields across compatible releases. Required data rewrites must be shipped as migrations or import/export compatibility code before a v1 release.
- File and memory stores are development/test stores and intentionally report unsupported storage operations for production readiness.
- Multi-node or multi-writer database access is outside the v1 SQLite support boundary. Use one API process per SQLite file and host-level volume snapshots for disaster recovery.

OIDC SSO is optional. Set `OTTE_OIDC_ISSUER`, `OTTE_OIDC_CLIENT_ID`, optional `OTTE_OIDC_CLIENT_SECRET`, and an externally reachable `OTTE_OIDC_REDIRECT_URI` ending in `/api/v1/auth/oidc/callback`. Set `OTTE_WEB_ORIGIN` or `OTTE_OIDC_ALLOWED_RETURN_ORIGINS` to the browser origin that should receive the callback token. Production auth operations flag missing, invalid, or insecure OIDC posture by env variable name without exposing provider URLs, client ids, secrets, redirect URIs, or return origins. Provider-specific Okta, Microsoft Entra ID, Google Workspace, and generic OIDC/SCIM setup notes live in [Identity Provider Setup](./identity-providers.md) and are summarized in the browser Admin Auth Setup panel.

Production auth operations are API-backed. Production stores start from empty state by default, and the browser routes an empty deployment to first-run owner setup backed by `GET|POST /api/v1/auth/bootstrap`. The bootstrap endpoint is accepted only while no users exist; it creates the first password-backed owner, marks that user as a persisted server admin, creates a private starter campaign and active scene, and returns a bearer session. Set `OTTE_DEMO_SEED=true` only for a production demo deployment that should start with `usr_demo_gm` and `usr_demo_player`; set `OTTE_DEMO_SEED=false` in local development when you want to test the clean bootstrap path. You can still set `OTTE_ADMIN_USER_IDS` to a comma-separated list of additional user ids that can call `/api/v1/admin/*`. Set `OTTE_SCIM_BEARER_TOKEN` to enable bearer-protected SCIM v2 user and group provisioning at `/api/v1/scim/v2/*`; server admins can map SCIM groups into campaign roles through `/api/v1/admin/scim/group-role-mappings`. Password reset requests create hashed `opr_` reset tokens and outbox email records; set `OTTE_PASSWORD_RESET_URL` to the browser reset screen, usually `https://your-web-origin/reset-password`, and set `OTTE_EMAIL_WEBHOOK_URL` plus optional `OTTE_EMAIL_WEBHOOK_TOKEN` to deliver messages through your mail bridge. Without a webhook, reset messages remain visible to server admins through `/api/v1/admin/email-outbox`. Local password users can enable TOTP MFA with one-time recovery codes through `/api/v1/auth/mfa/*`; OIDC deployments can keep using the identity provider's own MFA policy. Server admins can export redacted account/session/SCIM audit records from `/api/v1/admin/audit-logs` as JSON or NDJSON with filters. Legacy `x-user-id` auth is disabled outside tests unless `OTTE_ALLOW_LEGACY_USER_HEADER=true` is explicitly set.

Plugin trust and marketplace review policy are optional for local development and should be enabled for production plugin installs. The default `OTTE_PLUGIN_TRUST_POLICY=allow_unsigned` reports plugin trust status but permits unsigned local packages. Set `OTTE_PLUGIN_TRUST_POLICY=require_trusted` and configure `OTTE_PLUGIN_TRUST_KEYS` as either JSON (`{"trusted-local":"secret"}`) or comma-separated `key=secret` pairs to block unsigned packages and packages whose `plugin.signature.json` no longer matches the manifest and server-entrypoint checksums. Trusted-only mode blocks both installation and command execution for non-installable plugins. Server admins can review package versions/checksums in the Admin tab or through `/api/v1/admin/plugins/reviews`; rejected packages are blocked, and `OTTE_PLUGIN_REVIEW_POLICY=require_approved` requires an approved review before campaign install or execution. Set `OTTE_PLUGIN_REGISTRY_URLS` to a comma-separated allowlist of remote registry catalog URLs when GMs should be able to sync distributed plugin packages through `POST /api/v1/plugins/registry/sync`; downloaded registry packages are mirrored into the configured plugin root, record registry provenance in catalog source metadata, refuse to overwrite existing local package directories without matching registry provenance, and still pass through the same manifest, sandbox, versioning, trust-policy, and review-policy checks as local packages. In production, registry-sourced community packages require explicit review approval even if the broader review policy was left permissive, and `/api/v1/admin/plugins/operations` reports `community_registry_review_policy_permissive` until `OTTE_PLUGIN_REVIEW_POLICY=require_approved` is configured for the deployment. Server admins can inspect `/api/v1/admin/plugins/operations` for configured registries that have never synced, latest registry sync errors, registry-sourced package counts, and packages from registries no longer configured on the server. `OTTE_PLUGIN_REGISTRY_TIMEOUT_MS` controls registry fetch timeouts and defaults to 5000 milliseconds.

Plugin storage is campaign-scoped JSON state persisted in the same app store as campaign data, included in campaign archives, and available through `/api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage`. Both the human caller and the installed plugin grant need `plugin.configure` for storage reads, writes, deletes, and VM command storage mutations. Storage entries are intentionally small operational config/state records rather than file blobs; each value is limited to 16 KiB of JSON.

The worker app can process a single JSON job from stdin against a running API:

```bash
OTTE_API_URL=http://127.0.0.1:4000 OTTE_SESSION_TOKEN=ots_... pnpm --filter @open-tabletop/worker exec tsx src/index.ts < job.json
```

Supported worker job types are `campaign.export`, `campaign.import`, `asset.storage.migrate`, `asset.storage.cleanup`, `storage.backup`, `storage.restoreDrill`, `ai.memory.extract`, and `ai.session.recap`. Use `OTTE_SESSION_TOKEN` for bearer-session auth; `OTTE_USER_ID` is available only for local compatibility when the API has explicitly enabled legacy user-header auth. Asset migration, cleanup, SQLite backup, and restore-drill jobs call server-admin API routes, so the bearer session must belong to a user listed in `OTTE_ADMIN_USER_IDS`.

Workers can also lease persisted server-admin jobs from the API. Use `OTTE_WORKER_LEASE_ONCE=true` for one maintenance pass, or `OTTE_WORKER_LEASE_POLL=true` for a continuous polling worker. `OTTE_WORKER_ID` identifies the lease holder, `OTTE_WORKER_LEASE_SECONDS` controls lease expiry, `OTTE_WORKER_POLL_INTERVAL_MS` controls idle polling delay, and `OTTE_WORKER_MAX_JOBS` / `OTTE_WORKER_MAX_IDLE_POLLS` can bound a run for maintenance windows or tests:

```bash
OTTE_API_URL=http://127.0.0.1:4000 OTTE_SESSION_TOKEN=$OTTE_SESSION_TOKEN OTTE_WORKER_LEASE_POLL=true OTTE_WORKER_ID=worker-1 pnpm --filter @open-tabletop/worker exec tsx src/index.ts
```

The Docker Compose stack includes an opt-in supervised worker profile. Set `OTTE_WORKER_SESSION_TOKEN` to a bearer session for a server-admin user, then start the polling worker with restart supervision:

```bash
OTTE_WORKER_SESSION_TOKEN=$OTTE_SESSION_TOKEN docker compose --profile worker up -d worker
docker compose logs -f worker
```

The worker service waits for the API healthcheck, runs the built worker entrypoint with `OTTE_WORKER_LEASE_POLL=true`, and uses `restart: unless-stopped`. If `OTTE_WORKER_ID` is unset or blank, the worker falls back to the container host name so scaled Compose replicas lease with distinct ids. Tune `OTTE_WORKER_LEASE_SECONDS`, `OTTE_WORKER_POLL_INTERVAL_MS`, `OTTE_WORKER_MAX_JOBS`, and `OTTE_WORKER_MAX_IDLE_POLLS` when bounding a maintenance run.

For more throughput, scale the worker service rather than the API process. Keep one API writer for the v1 SQLite store and add worker replicas that lease from the shared admin job ledger:

```bash
OTTE_WORKER_SESSION_TOKEN=$OTTE_SESSION_TOKEN docker compose --profile worker up -d --scale worker=3 worker
docker compose logs -f worker
```

Capacity guidance:

- Use one worker for ordinary small self-hosted campaigns and scheduled backups.
- Use two or three workers when imports, exports, AI recap/memory jobs, storage backup/restore drills, or asset migration/cleanup jobs routinely queue for more than one polling interval.
- Keep `OTTE_WORKER_LEASE_SECONDS` comfortably longer than expected heartbeat gaps; the default `120` seconds fits local Compose. Lower it only when you need faster recovery from crashed workers.
- Keep `OTTE_WORKER_POLL_INTERVAL_MS` at `5000` for low-noise hosting. Reduce it for bursty maintenance windows, then restore it after the backlog drains.
- Set `OTTE_WORKER_MAX_JOBS` or `OTTE_WORKER_MAX_IDLE_POLLS` for one-off maintenance windows so temporary replicas exit after the queue is drained.
- Watch `/api/v1/admin/jobs/operations`, `/api/v1/admin/jobs/metrics`, or the Server Admin Job Ledger for stale heartbeats, expired leases, retry exhaustion, and queue age before adding more replicas.

Production orchestrator recipes:

- Keep exactly one API writer attached to the SQLite file or volume. Scale workers, web frontends, and edge/static serving separately; do not run multiple API pods/processes against the same SQLite database.
- Put a shared reverse proxy, ingress, or platform edge in front of the API for TLS, request body limits, and a shared rate limit. Keep `OTTE_RATE_LIMIT_ENABLED=true` as an in-process guard.
- Store `OTTE_SESSION_TOKEN`/`OTTE_WORKER_SESSION_TOKEN`, OIDC client secrets, SCIM bearer tokens, plugin trust keys, asset signing secrets, and webhook tokens in the platform secret manager. Do not bake them into images.
- Use liveness/readiness checks against `/api/v1/health` for the API and job-operations checks against `/api/v1/admin/jobs/operations` for worker dashboards.

For hosted deployment patterns beyond local Docker Compose, use [Hosted Deployment Recipes](./hosted-deployment-recipes.md). The recipes cover single-VM systemd, container hosts with persistent volumes, Kubernetes-style orchestrators, managed app platforms with volumes, and preview-only static/demo deployments.

For systemd on a single VM, run the API as one service and workers as a templated service:

```ini
# /etc/systemd/system/open-tabletop-api.service
[Service]
WorkingDirectory=/srv/open_tabletop_engine
EnvironmentFile=/etc/open-tabletop/api.env
ExecStart=/usr/bin/pnpm --filter @open-tabletop/api start
Restart=on-failure
RestartSec=5
```

```ini
# /etc/systemd/system/open-tabletop-worker@.service
[Service]
WorkingDirectory=/srv/open_tabletop_engine
EnvironmentFile=/etc/open-tabletop/worker.env
Environment=OTTE_WORKER_LEASE_POLL=true
Environment=OTTE_WORKER_ID=%H-%i
ExecStart=/usr/bin/pnpm --filter @open-tabletop/worker exec tsx src/index.ts
Restart=always
RestartSec=5
```

Start one API and as many workers as the queue needs:

```bash
systemctl enable --now open-tabletop-api
systemctl enable --now open-tabletop-worker@1 open-tabletop-worker@2
```

For Kubernetes or a similar orchestrator, keep the API deployment at one replica when using SQLite and put worker replicas in a separate deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: open-tabletop-api
spec:
  replicas: 1
  selector:
    matchLabels:
      app: open-tabletop-api
  template:
    metadata:
      labels:
        app: open-tabletop-api
    spec:
      containers:
        - name: api
          image: ghcr.io/example/open-tabletop-api:0.3
          envFrom:
            - secretRef:
                name: open-tabletop-api-secrets
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 4000
          volumeMounts:
            - name: sqlite
              mountPath: /app/storage
      volumes:
        - name: sqlite
          persistentVolumeClaim:
            claimName: open-tabletop-sqlite
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: open-tabletop-worker
spec:
  replicas: 2
  selector:
    matchLabels:
      app: open-tabletop-worker
  template:
    metadata:
      labels:
        app: open-tabletop-worker
    spec:
      containers:
        - name: worker
          image: ghcr.io/example/open-tabletop-worker:0.3
          envFrom:
            - secretRef:
                name: open-tabletop-worker-secrets
          env:
            - name: OTTE_WORKER_LEASE_POLL
              value: "true"
            - name: OTTE_WORKER_ID
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
```

For managed platforms that do not support a writable persistent SQLite volume, use campaign archives for portability and treat that environment as preview-only until a supported persistent store is available. For production, the v1 support boundary is a durable single-writer SQLite volume plus matching asset/plugin backups.

Job operations can be scraped through `GET /api/v1/admin/jobs/metrics` as Prometheus text. To deliver active job posture to an incident or notification bridge, set `OTTE_JOB_ALERT_WEBHOOK_URL`, optional `OTTE_JOB_ALERT_WEBHOOK_TOKEN`, and optional `OTTE_JOB_ALERT_WEBHOOK_TIMEOUT_MS`, then call `POST /api/v1/admin/jobs/alerts`. The alert payload contains redacted queue, lease, heartbeat, retry, worker, and remediation posture, not raw job archives or AI source text.

During leased execution, workers continue heartbeating the job record. If an operator cancels the job while the worker is waiting on an API request, the next rejected heartbeat aborts the in-flight request and the worker reports the lease as cancelled instead of marking it succeeded.

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

Campaign archives are JSON `.ottx` files. The import endpoint upserts every archive collection, including users, members, scenes, assets, tokens, actors, journals, encounters, combats, AI memory, audit logs, permission grants, plugin storage, and content-import preview records. Uploaded asset files are embedded as base64 archive `files` entries with size and `sha256` checksums; import validates and restores them through the active asset storage provider. Imports accept archive schema versions `0.1.0` and `0.2.0`; current exports are written as `0.2.0`, so importing an alpha archive and exporting it again is the supported upgrade path.

For outside dogfood reports, use the browser Report Bundle button or `GET /api/v1/campaigns/{campaignId}/dogfood-report-bundle`. The bundle is designed for issue attachments and omits user emails, auth/session records, token-bearing records, journal/handout/chat bodies, AI message and tool payloads, raw content-import data, asset URLs, and asset bytes.

Use the content import preview/apply/rollback endpoints for user-provided content that is not a full campaign archive. These records are campaign-local, include source adapter metadata plus provenance/license fields, support selective actor/item/journal/handout import, and can be rolled back or deleted with audit logs. They are not a D&D Beyond scraper or an auth-bypass mechanism; external-service adapters must use permitted APIs or user-provided exports and must not store proprietary content in this repository.

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
