# Railway Persistence

Status: operator runbook for the Railway API service.

The API already persists campaign state through the SQLite JSON-record store. On Railway, that file is durable only when the API service has a persistent volume mounted at the same path the runtime writes to.

## Required API Volume

Attach one Railway Volume to the API service with this mount path:

```text
/app/storage
```

This path is intentional. Railway runs the app from `/app`, and the API runtime is configured to write SQLite, backups, and local uploaded assets under `/app/storage`.

Keep the API service at one replica while SQLite is the active store. Scale the web service and worker service independently; do not run multiple API writers against the same SQLite file.

## API Runtime Variables

`railway.api.json` sets the production API start command with these persistence defaults:

```bash
OTTE_SQLITE_PATH=/app/storage/opentabletop.sqlite
OTTE_UPLOAD_DIR=/app/storage/uploads
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

1. Open the hosted app and create a campaign.
2. Upload a small map asset.
3. Redeploy the API service without wiping the volume.
4. Confirm the campaign and uploaded asset still load.
5. As a server admin, call `GET /api/v1/admin/storage/operations`; expect supported SQLite posture, integrity `ok`, no missing migrations, no missing indexes, and a latest backup after startup backup completes.
6. Run `POST /api/v1/admin/storage/restore-drill`; expect `status: "passed"`.

Use Railway Volume backups for platform-level recovery and the app backup/restore-drill endpoints for application-level recovery checks. For larger or higher-traffic asset storage, configure a Railway Storage Bucket or another S3-compatible provider and set `OTTE_ASSET_STORAGE=s3`.
