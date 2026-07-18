# Self-Hosting

Choose and secure the deployment mode using the [deployment threat model](./threat-model.md) before exposing the service beyond loopback or a trusted LAN.

For drag-and-drop local hosting without Docker or cloud game hosting, see [Desktop Hosting](./desktop-hosting.md). The desktop app uses local SQLite/assets and the managed relay instead of the Compose stack below.

Run the full local stack:

```bash
pnpm install
pnpm compose:env:init
docker compose --env-file .env config --quiet
docker compose up --build
```

`compose:env:init` creates a gitignored `.env` with independent random asset-signing and MinIO credentials, the explicit loopback-only HTTP exceptions used by this profile, same-origin browser settings, and daily SQLite backup scheduling. It sets mode `0600` on POSIX; on Windows it removes inherited access rules and grants the current account access. The Compose file refuses to use a known fallback object-store password. The initializer refuses to overwrite an existing `.env`; use `-- --force` only when you intentionally want to rotate and replace the local configuration. Never reuse this local `.env` for an internet-facing deployment.

Public self-registration is disabled by default. To allow account creation without an invite, set `OTTE_PUBLIC_REGISTRATION=true` in `.env` and recreate the API service. Leave it `false` for invite-only or internet-facing installations unless open registration is intentional.

If the default host ports are already in use, override them before starting Compose:

```bash
API_PORT=4480 \
WEB_PORT=5183 \
MINIO_API_PORT=9900 \
MINIO_CONSOLE_PORT=9901 \
OTTE_WEB_ORIGIN=http://localhost:5183 \
OTTE_CORS_ALLOWED_ORIGINS=http://localhost:5183 \
docker compose up --build
```

Services:

- Web: `http://localhost:5173`
- API: `http://localhost:4000`
- MinIO console: `http://localhost:9001`

MinIO, the direct API port, and the web port bind to `127.0.0.1` by default (`INFRA_BIND_ADDRESS=127.0.0.1`, `API_BIND_ADDRESS=127.0.0.1`, and `WEB_BIND_ADDRESS=127.0.0.1`) so local HTTP exceptions and generated credentials are not exposed to the LAN. The browser uses the web container's same-origin `/api` and WebSocket proxy; `VITE_API_URL` is intentionally empty. Keep all three bindings on loopback unless a TLS reverse proxy and host firewall provide the public boundary.

On a new MinIO volume, API readiness creates the configured bucket before reporting healthy. MinIO, API, and web each have a healthcheck, and the dependency conditions prevent downstream services from starting before their required service is healthy. After startup, `docker compose ps` should show all three services healthy and `http://localhost:5173/api/v1/health` should return `ok: true` through the same-origin proxy.

Audio/video traffic is intentionally not proxied through the OpenTabletop API. Use a dedicated RTC provider or media stack and share room links through campaign-visible journal/chat/onboarding surfaces; see [Audio and Video Integrations](./audio-video-integrations.md).

The API persists campaign state to SQLite at `storage/opentabletop.sqlite` by default. PostgreSQL and Redis are not runtime dependencies and are intentionally absent from the default Compose topology. The supported v1 topology has one API writer per SQLite file; adding database or cache containers does not make it multi-writer safe. Local non-Docker API runs store uploaded map assets under `OTTE_UPLOAD_DIR` unless `OTTE_ASSET_STORAGE=s3` is configured. Docker Compose defaults uploaded assets to MinIO with bucket `opentabletop-assets`, endpoint `http://minio:9000`, and path-style S3 access. The SQLite file lives in the `api-storage` volume; the `api-uploads` volume remains available for local-storage fallback; and `api-plugins` keeps operator-installed and registry-synced plugin packages across container replacement. Bundled plugins remain image-owned so upgrades cannot be shadowed by a stale volume.

AI threads default to `OTTE_AI_PROVIDER=codex-app-server`. `OTTE_AI_PROVIDER=codex-loopback` is available as a deterministic local Codex App Server adapter smoke test. `OTTE_AI_PROVIDER=codex-app-server` connects to a live Codex app-server WebSocket, defaulting to `OTTE_CODEX_APP_SERVER_URL=ws://127.0.0.1:4500`; `OTTE_AI_PROVIDER_TIMEOUT_MS` defaults to `900000` (15 minutes) for long-running text and tool turns. For local loopback URLs the API starts that listener on first use with the local Codex launcher unless `OTTE_CODEX_APP_SERVER_AUTOSTART=false`. Set `OTTE_CODEX_APP_SERVER_COMMAND` only for a custom launcher; Windows local auto-start already prefers the npm `codex.cmd` shim instead of the PowerShell shim. The Railway API service bundles the Codex CLI and sets `OTTE_CODEX_APP_SERVER_COMMAND=apps/api/node_modules/.bin/codex` so the app-server can start inside the deployed container. Set `OTTE_CODEX_APP_SERVER_LOGIN_TYPE=chatgptDeviceCode` for hosted deployments where the browser cannot reach a localhost OAuth callback. `OTTE_CODEX_APP_SERVER_CWD`, `OTTE_CODEX_MODEL`, `OTTE_CODEX_IMAGE_MODEL`, and `OTTE_CODEX_MODEL_PROVIDER` optionally override the Codex working directory and model selection. For Docker Compose, remember that `127.0.0.1` inside the API container is the container itself; run the app-server on a host-reachable listener and set `OTTE_CODEX_APP_SERVER_URL` to that reachable WebSocket endpoint. OpenAI-backed text and image generation are routed through Codex app-server only; the API runtime does not read `OPENAI_API_KEY` or expose direct OpenAI API-key provider settings. Real AI map/token image generation uses Codex app-server `imageGeneration` items and fails visibly if the app-server is unavailable, unauthenticated, lacks image-generation capability, or returns no image bytes. `OTTE_AI_PROVIDER_RETRY_ATTEMPTS` controls the pre-event provider retry budget and defaults to `1`, clamped from `0` to `3`. `OTTE_AI_IMAGE_PROVIDER_TIMEOUT_MS` defaults to `240000` for generated art. `OTTE_AI_INPUT_TOKEN_COST_USD_PER_1K` and `OTTE_AI_OUTPUT_TOKEN_COST_USD_PER_1K` are optional non-negative rates used to estimate thread and campaign AI costs from provider-reported token usage. Server admins can inspect redacted provider runtime settings, aggregate AI usage, failures, and tool activity at `/api/v1/admin/ai/operations` and in the browser Admin tab.

The API applies an in-process fixed-window per-route caller rate limit when `OTTE_RATE_LIMIT_ENABLED=true`; it is enabled by default when `NODE_ENV=production`. `OTTE_RATE_LIMIT_WINDOW_SECONDS` defaults to `60`, and `OTTE_RATE_LIMIT_MAX_REQUESTS` defaults to `600`. Password login additionally uses account, client-network, and account/network limits (`OTTE_LOGIN_RATE_LIMIT_*`) and a bounded asynchronous scrypt queue so distributed credential attacks and event-loop starvation are independently constrained. `OTTE_TRUSTED_PROXY_HOPS` must equal the exact right-most proxy-hop count; forwarded client addresses are ignored when it is zero. Throttled requests return `429` with `Retry-After`. For multi-node deployments, keep these runtime guards enabled and put a shared edge/load-balancer limiter in front of the API.

Browser sessions are issued as `HttpOnly; SameSite=Lax` cookies, mutations require same-origin evidence, logout and session revocation invalidate server state, and the web client keeps only a non-secret cookie transport marker after login. The local loopback profile explicitly permits a non-`Secure` cookie because it uses HTTP. Hosted deployments must terminate TLS, serve the browser and API from the same public site (preferably one origin with `/api` reverse-proxied as in Compose), set `OTTE_WEB_ORIGIN`/`OTTE_CORS_ALLOWED_ORIGINS` to that public HTTPS origin, set the exact trusted proxy-hop count, keep `OTTE_SESSION_COOKIE_SECURE=true`, and remove `OTTE_ALLOW_INSECURE_LOCAL_SESSION_COOKIE`. A CORS allowlist alone does not make a `SameSite=Lax` session cookie work across different sites and is not a substitute for the same-origin mutation boundary.

Server admins can inspect SQLite persistence with `GET /api/v1/admin/storage/operations`; public `/api/v1/health` also exposes the non-secret scheduled-backup status. The response reports the JSON-record storage model, applied migrations, required indexes, SQLite integrity-check result, record counts by collection, latest backup status, and scheduled-backup status without exposing host filesystem paths. Compose passes `OTTE_SQLITE_BACKUP_RUN_ON_START=true`, `OTTE_SQLITE_BACKUP_INTERVAL_SECONDS=86400`, and `OTTE_SQLITE_BACKUP_REASON=compose-daily` by default. Each scheduled run creates an application-managed, content-addressed copy of every recoverable asset object under the backup volume, binds that snapshot identity to the checksummed SQLite recovery manifest, verifies every captured object, and runs a strict paired restore drill before reporting success. These files still share the deployment's storage failure domain, so copy the paired recovery artifacts off-volume and keep provider-native MinIO/S3 snapshots for disaster recovery; see [Backup and Restore](./backup-restore.md).

Server admins can inspect bounded process-local operations counters with `GET /api/v1/admin/operations/metrics` or the Admin tab's Hosted Operations section. The counters cover HTTP errors/latency, stale writes, realtime disconnects, durable writes, and backup/restore outcomes without identifiers, paths, credentials, or private content. They are enabled by default; `OTTE_OPERATIONS_METRICS=false` disables collection. Use the [Admin and Observability Checklist](./admin-observability-checklist.md) to map changes to incident actions and set hosted alerts only after measuring the selected topology.

Operational-history deletion is never automatic. `GET /api/v1/admin/retention/operations` measures the supported terminal ledgers; the Admin Measured Retention workflow or `POST /api/v1/admin/retention/prune` requires an exact dry run, unchanged target-set hash, bounded batch, idempotency key, and operator reason. Canonical state, audit, active retry protection, failed/retryable work, campaign import/export jobs, and archive recovery operations are exempt. See [Measured Operational Retention](./admin-observability-checklist.md#measured-operational-retention).

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

Docker Compose defaults to `OTTE_PLUGIN_TRUST_POLICY=require_trusted` and `OTTE_PLUGIN_REVIEW_POLICY=require_approved`: unsigned packages, invalid signatures, and unapproved versions cannot be installed or executed. Configure `OTTE_PLUGIN_TRUST_KEYS` as either JSON (`{"trusted-local":"secret"}`) or comma-separated `key=secret` pairs for packages whose `plugin.signature.json` matches the manifest and server-entrypoint checksums. A developer who intentionally runs the API outside the production Compose profile may opt into `allow_unsigned` for local-only packages, but that permissive override is not the deployment default and must not be carried into production. Server admins can review package versions/checksums in the Admin tab or through `/api/v1/admin/plugins/reviews`; rejected packages remain blocked. Set `OTTE_PLUGIN_REGISTRY_URLS` to a comma-separated allowlist of remote registry catalog URLs when GMs should be able to sync distributed plugin packages through `POST /api/v1/plugins/registry/sync`; downloaded registry packages are mirrored into the configured plugin root, record registry provenance in catalog source metadata, refuse to overwrite existing local package directories without matching registry provenance, and still pass through the same manifest, sandbox, versioning, trust-policy, and review-policy checks as local packages. In production, registry-sourced community packages require explicit review approval even if an operator deliberately relaxed the broader review policy, and `/api/v1/admin/plugins/operations` reports `community_registry_review_policy_permissive` until `OTTE_PLUGIN_REVIEW_POLICY=require_approved` is restored. Server admins can inspect `/api/v1/admin/plugins/operations` for configured registries that have never synced, latest registry sync errors, registry-sourced package counts, and packages from registries no longer configured on the server. `OTTE_PLUGIN_REGISTRY_TIMEOUT_MS` controls registry fetch timeouts and defaults to 5000 milliseconds.

Container deployments keep bundled, image-owned plugins at `/app/plugins` and mutable operator-installed packages at `/app/storage/plugins`. Do not mount a persistent volume over `/app/plugins`; doing so hides security fixes and new bundled versions shipped in later images.

Plugin storage is campaign-scoped JSON state persisted in the same app store as campaign data, included in campaign archives, and available through `/api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage`. Both the human caller and the installed plugin grant need `plugin.configure` for storage reads, writes, deletes, and VM command storage mutations. Storage entries are intentionally small operational config/state records rather than file blobs; each value is limited to 16 KiB of JSON.

The worker is a dedicated service principal, not a user or server-admin session. Give the API only a SHA-256 token hash in `OTTE_WORKER_TOKEN_HASHES`; give the worker the matching plaintext secret in `OTTE_WORKER_TOKEN`. The worker sends `Authorization: Worker ...`, its stable `OTTE_WORKER_ID`, and the active job id. The API permits only lease, heartbeat, settlement, and the exact method/path/body authorized by that active unexpired lease. A worker token cannot list users, inspect plugin administration, or read arbitrary campaigns.

Generate the plaintext in a secret manager and compute its hash without writing the plaintext into API state or configuration. This PowerShell example keeps the value in the current process only:

```powershell
$env:OTTE_WORKER_TOKEN = node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))"
$digest = node -e "process.stdout.write(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" $env:OTTE_WORKER_TOKEN
$env:OTTE_WORKER_ID = "worker-primary"
$env:OTTE_WORKER_TOKEN_HASHES = "worker-primary=sha256:$digest"
$env:OTTE_WORKER_PROFILE_ENABLED = "true"
```

Supported worker job types are `campaign.export`, `campaign.import`, `asset.storage.migrate`, `asset.storage.cleanup`, `storage.backup`, `storage.restoreDrill`, `ai.memory.extract`, `ai.session.recap`, and `report.bundle`. Campaign import jobs require the inspected campaign's exact `expectedUpdatedAt` value; the API, lease-bound dispatch, and worker preserve that revision unchanged so a queued import cannot overwrite a newer campaign. Asset migration and cleanup jobs use the same prepared flow as the admin API: run a `dryRun: true` job first, then create an execution job with `dryRun: false` and the returned `targetSetHash` as `expectedTargetSetHash`. The prepared hash is part of the exact lease-bound dispatch payload. The worker app can process one already-leased JSON job from stdin; its id must name an active unexpired lease held by the configured worker identity:

```powershell
$env:OTTE_API_URL = "http://127.0.0.1:4000"
Get-Content job.json | pnpm --filter @open-tabletop/worker exec tsx src/index.ts
```

Workers can also lease persisted jobs. Use `OTTE_WORKER_LEASE_ONCE=true` for one maintenance pass, or `OTTE_WORKER_LEASE_POLL=true` for continuous polling. `OTTE_WORKER_ID` identifies the principal and lease holder, `OTTE_WORKER_LEASE_SECONDS` controls lease expiry, `OTTE_WORKER_POLL_INTERVAL_MS` controls idle polling delay, and `OTTE_WORKER_MAX_JOBS` / `OTTE_WORKER_MAX_IDLE_POLLS` can bound a run:

```powershell
$env:OTTE_WORKER_LEASE_POLL = "true"
pnpm --filter @open-tabletop/worker exec tsx src/index.ts
```

The Docker Compose stack includes an opt-in supervised worker profile. Configure `OTTE_WORKER_PROFILE_ENABLED=true`, `OTTE_WORKER_TOKEN_HASHES`, `OTTE_WORKER_TOKEN`, and a matching `OTTE_WORKER_ID`, then start the polling worker:

```bash
docker compose --profile worker up -d worker
docker compose logs -f worker
```

In production, `/api/v1/health` returns `503` when the worker profile is enabled without at least one valid named token hash or when any configured hash entry is malformed. The worker service waits for that healthcheck, runs with `OTTE_WORKER_LEASE_POLL=true`, and uses `restart: unless-stopped`. Do not enable the profile until both sides of the secret are configured.

Rotate without changing the stable worker identity: add the new hash beside the old hash using the same worker id, roll workers from the old plaintext to the new plaintext, verify every replica, and then remove the old hash. Multiple entries are comma- or newline-separated:

```text
OTTE_WORKER_TOKEN_HASHES=worker-primary=sha256:<new-hex>,worker-primary=sha256:<old-hex>
```

`OTTE_WORKER_SESSION_TOKEN` and `OTTE_SESSION_TOKEN` are deprecated migration inputs. They work only outside production when `OTTE_WORKER_ALLOW_LEGACY_SESSION_TOKEN=true`; production hard-refuses them even if the flag is set. Remove the compatibility flag after migration.

If `OTTE_WORKER_ID` is unset or blank outside Compose, the worker falls back to a sanitized host name; that fallback must still have an exact matching hash entry on the API. Compose defaults to `worker-primary`. Prefer an explicitly managed stable id for planned rotation and use distinct ids/hashes when replicas need independently revocable credentials. Tune `OTTE_WORKER_LEASE_SECONDS`, `OTTE_WORKER_POLL_INTERVAL_MS`, `OTTE_WORKER_MAX_JOBS`, and `OTTE_WORKER_MAX_IDLE_POLLS` when bounding a maintenance run.

For more throughput, scale the worker service rather than the API process. Keep one API writer for the v1 SQLite store and add worker replicas that lease from the shared admin job ledger:

```bash
docker compose --profile worker up -d --scale worker=3 worker
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
- Store `OTTE_WORKER_TOKEN`, user sessions, OIDC client secrets, SCIM bearer tokens, plugin trust keys, asset signing secrets, and webhook tokens in the platform secret manager. Expose only `OTTE_WORKER_TOKEN_HASHES` to the API and only the matching plaintext token to the worker. Do not bake either into images.
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
Environment=OTTE_WORKER_ID=worker-primary
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
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
        fsGroupChangePolicy: OnRootMismatch
      containers:
        - name: api
          image: ghcr.io/example/open-tabletop-api:0.3
          securityContext:
            allowPrivilegeEscalation: false
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

The API image runs as UID/GID `1000`. Provision other persistent volumes or bind mounts writable by `1000:1000`; for storage providers that do not apply `fsGroup`, use a volume-specific init container or administrator provisioning step instead of running the API as root.

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
              value: "worker-primary"
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

Uploaded map bytes pass through the built-in asset scanner before local or S3 storage writes. EICAR test signatures, active SVG content, executable/script uploads, and HTML uploads are rejected with `422 asset_security_blocked`; clean uploads store scanner metadata on the asset record. For higher-assurance hosting, set `OTTE_ASSET_TRUST_WEBHOOK_URL` to call an external AV/trust scanner after the built-in scanner passes and before any asset row or object byte is written. The webhook receives JSON with `name`, `mimeType`, `sizeBytes`, `checksum`, and `contentBase64`; optional `OTTE_ASSET_TRUST_WEBHOOK_TOKEN` is sent as a bearer token. Scanner responses must return `status: "clean"` or `status: "blocked"` plus optional `scanner` and `findings`; blocked responses, high-severity findings, invalid responses, HTTP failures, or timeouts reject the upload by default. Set `OTTE_ASSET_TRUST_FAIL_CLOSED=false` only for deployments that explicitly prefer fail-open behavior during scanner outages. `OTTE_ASSET_QUOTA_BYTES` applies per campaign to active and archived assets. `OTTE_ASSET_RETENTION_DAYS` assigns a default asset expiry when new assets are created. Set `OTTE_ASSET_CDN_BASE_URL` when a CDN fronts the API blob route; signed delivery URLs use that base URL and require `OTTE_ASSET_URL_SIGNING_SECRET` in production. The web container reads that same value at startup and permits only its exact origin in CSP `connect-src`, so keep the API and web service configuration aligned. Add the public web origin to `OTTE_CORS_ALLOWED_ORIGINS` so CDN image fetches used by board capture receive an explicit CORS grant. `apps/asset-edge` provides a Cloudflare Worker edge configuration for those signed URLs; see [Asset Edge Worker](./asset-edge.md). `OTTE_ASSET_CLEANUP_GRACE_DAYS` controls the default wait before cleanup jobs physically remove deleted or expired asset bytes, and `OTTE_ASSET_CLEANUP_INTERVAL_SECONDS` enables API-hosted recurring cleanup. Campaign owners can inspect campaign usage at `/api/v1/campaigns/{campaignId}/assets/storage`, request signed delivery at `/api/v1/assets/{assetId}/delivery-url`, and archive or delete assets through `/api/v1/assets/{assetId}/lifecycle`. Server admins can inspect global usage at `/api/v1/admin/assets/storage`. Manual quarantine, migration, and cleanup require an idempotency key plus a dry-run `targetSetHash` preparation; manual CDN purge requires an idempotency key, exact asset revision, and matching downstream delivery ID.

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

Campaign archives support two compatible transports. The legacy JSON `.ottx.json` route embeds uploaded assets as base64 `files` entries for existing tooling. The bounded `application/vnd.open-tabletop.ottx-stream` route (`GET /api/v1/campaigns/{campaignId}/export/stream`, `POST /api/v1/import/campaign/stream`) carries the same JSON metadata plus raw length-delimited assets and SHA-256 trailers, avoiding a full encoded asset copy. Prefer the stream route for large campaigns and direct-to-disk operational backups. Stream import authenticates and verifies its idempotency key before parsing, stages and incrementally verifies every file before mutation, then uses the same permission checks, reference validation, conflict modes, id regeneration, atomic state replacement, and compensating object rollback as JSON import. `OTTE_CAMPAIGN_ARCHIVE_IMPORT_MAX_BYTES` bounds stream metadata, `OTTE_CAMPAIGN_ARCHIVE_EMBEDDED_ASSET_MAX_BYTES` bounds aggregate raw asset bytes, `OTTE_CAMPAIGN_ARCHIVE_ASSET_MAX_FILES` bounds embedded file count (default `10000`), and the normal upload-size limit bounds each file. Non-identity `Content-Encoding` is rejected rather than expanded, so these limits are the compressed and uncompressed boundary. Imports accept archive schema versions `0.1.0` and `0.2.0`; current exports are written as `0.2.0`, so importing an alpha archive and exporting it again is the supported upgrade path.

Stream imports spool to `otte-archive-stream-*` directories under the process temporary directory and delete normal, rejected, cancelled, and transaction-completed staging. A disconnected client aborts in-flight asset restoration and the durable request boundary rolls back state and object writes before releasing the mutation gate. Byte-range resume is not implemented: retry the same source file from byte zero and retain the same `Idempotency-Key`, which safely replays a completed request. Operators should alert on abnormal temporary-volume growth and may remove orphaned `otte-archive-stream-*` directories only while all API processes are stopped; never sweep active process temporary files. The web direct-to-disk export requires the File System Access picker available in current Chromium-based browsers; use the legacy JSON action only for small archives when that API is unavailable. Manual release verification should profile browser and API memory with a larger-than-legacy archive, exercise keyboard/screen-reader progress and cancel/retry, disconnect during validation, and confirm temporary space returns to baseline.

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

## AI policy and retention

Production AI is fail-closed until installation policy is explicit. To keep AI off, set `OTTE_AI_ENABLED=false`. To enable it, also set `OTTE_AI_CONTEXT_SCOPES=public` or `public,gm_private`, a bounded `OTTE_AI_RETENTION_DAYS`, and user-facing `OTTE_AI_PROVIDER_TRANSMISSION_DISCLOSURE`. Review each campaign policy in AI Studio; a legacy campaign without reviewed policy remains disabled in production.

Use the campaign privacy preview before pruning local AI operational history. Pruning is bounded and preserves proposals, AI memory/canon, and aggregate audit. It does not request or verify deletion by Codex app-server or any upstream model provider; follow the provider/account retention controls separately.
