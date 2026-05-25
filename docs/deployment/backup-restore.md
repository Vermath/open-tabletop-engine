# Backup And Restore

## What To Back Up

- SQLite state database, defaulting to `storage/opentabletop.sqlite` or `OTTE_SQLITE_PATH`.
- Uploaded asset storage:
  - Local disk under `OTTE_UPLOAD_DIR`.
  - S3/MinIO bucket configured by `OTTE_ASSET_STORAGE`, `OTTE_S3_BUCKET`, and related settings.
- Plugin package root and trusted signing key configuration.
- Deployment environment variable inventory, with secrets stored in the host's secret manager.
- Campaign `.ottx` exports for high-value dogfood campaigns.

## SQLite Backup

Stop API and worker processes before copying the SQLite file. On Windows PowerShell:

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item -LiteralPath "storage\opentabletop.sqlite" -Destination "storage\backups\opentabletop-$stamp.sqlite"
```

For Docker Compose, copy the SQLite file out of the `api-storage` volume or snapshot the volume with the host's backup tooling.

For Railway, attach the API service volume at `/app/storage` and keep `OTTE_SQLITE_PATH=/app/storage/opentabletop.sqlite`. Use Railway Volume backups for platform recovery, and keep the app's SQLite backups inside the same volume for restore drills and pre-upgrade checks.

Server admins can also create an online SQLite backup through the Admin UI, the server-admin API, or the worker CLI:

```bash
printf '{"id":"job_storage_backup","type":"storage.backup","payload":{"reason":"pre-upgrade"}}' | \
  OTTE_API_URL=http://127.0.0.1:4000 OTTE_SESSION_TOKEN=$OTTE_SESSION_TOKEN pnpm --filter @open-tabletop/worker exec tsx src/index.ts
```

The online backup is stored under the SQLite storage directory's `backups` folder. Run a restore drill after creating it:

```bash
printf '{"id":"job_storage_restore_drill","type":"storage.restoreDrill","payload":{}}' | \
  OTTE_API_URL=http://127.0.0.1:4000 OTTE_SESSION_TOKEN=$OTTE_SESSION_TOKEN pnpm --filter @open-tabletop/worker exec tsx src/index.ts
```

For unattended backups from the API process, set:

```bash
OTTE_SQLITE_BACKUP_RUN_ON_START=true
OTTE_SQLITE_BACKUP_INTERVAL_SECONDS=86400
OTTE_SQLITE_BACKUP_REASON=nightly
```

The Admin UI and `GET /api/v1/admin/storage/operations` show whether scheduled backups are enabled, the interval, and the latest scheduled run result. Keep host-level snapshots for disaster recovery; the in-process scheduler only creates SQLite backup files in the configured storage volume.

## Asset Backup

For local disk assets, copy the full upload directory while the API is stopped. For S3/MinIO, use provider-native bucket versioning, replication, or snapshot tooling. Keep the asset backup timestamp aligned with the SQLite backup timestamp so asset metadata and object bytes match.

## Campaign Archive Backup

Campaign owners can export portable `.ottx` archives:

```bash
curl -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  "http://localhost:4000/api/v1/campaigns/{campaignId}/export" \
  -o campaign.ottx.json
```

Archive import supports `0.1.0` and `0.2.0`; current exports are `0.2.0`.

## Restore

1. Stop API and worker processes.
2. Restore the SQLite backup.
3. Restore the matching asset backup.
4. Restore plugin package root and environment configuration.
5. Start the API.
6. Run a campaign export and a small browser smoke before resuming play.

## Rollback Procedure

Use rollback when an upgrade, migration, import, or maintenance operation fails validation and you need to return to the last known-good deployment.

1. Stop API, web, worker, and scheduled-job processes.
2. Preserve failure evidence before overwriting anything:
   - Copy current API logs.
   - Save `GET /api/v1/admin/storage/operations` output if the API is still reachable.
   - Keep the failed archive/import payload or deployment version identifier.
3. Restore the last known-good SQLite backup into the configured `OTTE_SQLITE_PATH` location.
4. Restore the matching asset backup from the same timestamp window.
5. Restore plugin package root, trust keys, and environment configuration from the same release snapshot.
6. Restart the previous known-good code version.
7. Run recovery checks before reopening the table:
   - `GET /api/v1/campaigns` lists expected campaigns.
   - `GET /api/v1/admin/storage/operations` reports SQLite integrity `ok`.
   - `POST /api/v1/admin/storage/restore-drill` passes against the restored backup set.
   - One representative campaign export succeeds.
   - One GM browser smoke can load the active scene and one uploaded asset.
8. Record the failed version, restored backup file name, asset backup identifier, and validation result in the incident notes.

## Recovery Checks

- `GET /api/v1/campaigns` lists expected campaigns.
- `GET /api/v1/campaigns/{campaignId}/export` returns `format: "ottx"`.
- Uploaded map assets load through `GET /api/v1/assets/{assetId}/blob`.
- `GET /api/v1/admin/assets/storage` shows no unexpected missing storage references.
- Safe content import rollback/delete records remain auditable for applied user-provided imports.
