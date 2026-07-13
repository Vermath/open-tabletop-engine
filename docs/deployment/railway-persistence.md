# Railway Persistence

Status: operator runbook for the Railway API service.

The API already persists campaign state through the SQLite JSON-record store. On Railway, that file is durable only when the API service has a persistent volume mounted at the same path the runtime writes to.

## Required API Volume

Attach one Railway Volume to the API service with this mount path:

```text
/app/storage
```

This path is intentional. Railway runs the app from `/app`, and the API runtime is configured to write SQLite, backups, local uploaded assets, and mutable plugin packages under `/app/storage`.

Keep the API service at one replica while SQLite is the active store. Scale the web service and worker service independently; do not run multiple API writers against the same SQLite file.

## API Runtime Variables

`railway.api.json` sets the production API start command with these persistence defaults:

```bash
OTTE_SQLITE_PATH=/app/storage/opentabletop.sqlite
OTTE_UPLOAD_DIR=/app/storage/uploads
OTTE_PLUGIN_DIR=/app/storage/plugins
OTTE_BUNDLED_PLUGIN_DIR=/app/plugins
OTTE_DEMO_SEED=false
OTTE_SQLITE_BACKUP_RUN_ON_START=true
OTTE_SQLITE_BACKUP_INTERVAL_SECONDS=86400
OTTE_SQLITE_BACKUP_REASON=railway-nightly
```

If these values are moved into Railway service variables later, keep the values identical unless the volume mount path changes at the same time.

## Before The Next Deploy

If the current Railway deployment still has campaign content, export important campaigns as `.ottx` archives or create an admin SQLite backup before redeploying. Content already lost from an ephemeral filesystem cannot be recovered unless it exists in a Railway volume backup, an app SQLite backup, or a campaign archive.

## Validation

After attaching the volume and deploying:

1. Confirm the public `/api/v1/health` endpoint returns JSON through the web service. The Railway web health check uses this path so a broken internal API target cannot pass on static HTML alone.
2. Confirm the web service's `OTTE_API_URL`, or its built-in `open-tabletopapi.railway.internal:8080` fallback, matches the deployed API service name and listening port.
3. Keep Railway's drain window longer than `OTTE_WEB_SHUTDOWN_TIMEOUT_MS` (default `1000` milliseconds). The web runtime stops accepting new connections on `SIGINT`/`SIGTERM` and force-closes remaining browser and upstream API sockets at that deadline.
4. Open the hosted app and create a campaign.
5. Upload a small map asset.
6. Redeploy the API service without wiping the volume.
7. Confirm the campaign and uploaded asset still load.
8. Confirm the first startup seeds missing bundled plugin packages from `/app/plugins` into the volume-backed plugin directory. Startup never overwrites an existing persisted package directory, so registry-installed or operator-repaired packages remain authoritative across redeploys.
9. As a server admin, call `GET /api/v1/admin/storage/operations`; expect supported SQLite posture, integrity `ok`, no missing migrations, no missing indexes, and a latest backup after startup backup completes.
10. Run `POST /api/v1/admin/storage/restore-drill`; expect `status: "passed"`.

Use Railway Volume backups for platform-level recovery and the app backup/restore-drill endpoints for application-level recovery checks. For larger or higher-traffic asset storage, configure a Railway Storage Bucket or another S3-compatible provider and set `OTTE_ASSET_STORAGE=s3`.
