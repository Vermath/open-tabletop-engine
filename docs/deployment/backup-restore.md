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

The repository also provides a direct-file maintenance command that does not require a running API. It refuses an implicit database path:

```bash
pnpm --filter @open-tabletop/api storage:maintenance -- status --database storage/opentabletop.sqlite
pnpm --filter @open-tabletop/api storage:maintenance -- backup --database storage/opentabletop.sqlite --reason pre-upgrade
```

Stop the API, workers, and scheduled jobs before using the command for offline maintenance. `status` and `backup` open the SQLite file directly; they do not call an HTTP endpoint.

For Railway, attach the API service volume at `/app/storage` and keep `OTTE_SQLITE_PATH=/app/storage/opentabletop.sqlite`. Use Railway Volume backups for platform recovery, and keep the app's SQLite backups inside the same volume for restore drills and pre-upgrade checks.

Server admins can also create an online SQLite backup through the Admin UI or by queuing a job for a configured dedicated worker principal:

```bash
IDEMPOTENCY_KEY="$(uuidgen)"
curl -X POST -H "Authorization: Bearer $OTTE_SESSION_TOKEN" -H "Idempotency-Key: $IDEMPOTENCY_KEY" -H "content-type: application/json" \
  -d '{"type":"storage.backup","payload":{"reason":"pre-upgrade"}}' \
  http://127.0.0.1:4000/api/v1/admin/jobs
OTTE_WORKER_LEASE_ONCE=true pnpm --filter @open-tabletop/worker exec tsx src/index.ts
```

The online backup is stored under the SQLite storage directory's `backups` folder. Every new SQLite backup also writes a versioned `<backup>.recovery.json` sidecar. The sidecar records:

- The SQLite filename, byte size, and SHA-256 checksum.
- A deterministic inventory of asset metadata in SQLite: active provider, asset count, stored-object count, total recorded bytes, and SHA-256 digest.
- The exact content-addressed app-managed asset snapshot identity: provider, SHA-256 snapshot ID, and creation time.

The online API copies every recoverable local or S3/MinIO object into the SQLite backup volume, verifies its size and SHA-256, and binds that managed snapshot to the database sidecar. The request does not accept an arbitrary provider-native snapshot as a restorable managed identity. Create an additional provider-native or host-volume snapshot separately for loss of the entire backup volume.

```bash
IDEMPOTENCY_KEY="$(uuidgen)"
curl -X POST -H "Authorization: Bearer $OTTE_SESSION_TOKEN" -H "Idempotency-Key: $IDEMPOTENCY_KEY" -H "content-type: application/json" \
  -d '{"reason":"pre-upgrade","requireAssetSnapshot":true}' \
  http://127.0.0.1:4000/api/v1/admin/storage/backup
```

Online backup creation requires an `Idempotency-Key`. Reuse the same key only when retrying the exact same request; a successful replay returns the original backup receipt instead of creating another backup file.

Run a strict restore drill by copying `recoveryPoint.manifest.assetSnapshot` exactly from the backup response or `GET /api/v1/admin/storage/operations`:

```bash
curl -X POST -H "Authorization: Bearer $OTTE_SESSION_TOKEN" -H "content-type: application/json" \
  -d '{"backupFileName":"opentabletop-2026-07-13T18-30-01-000Z.sqlite","requireAssetSnapshot":true,"expectedAssetSnapshot":{"provider":"s3","snapshotId":"sha256:EXACT_SIDECAR_SNAPSHOT_ID","createdAt":"2026-07-13T18:30:00.000Z"}}' \
  http://127.0.0.1:4000/api/v1/admin/storage/restore-drill
```

The drill verifies the sidecar checksum, SQLite file identity and checksum, SQLite integrity, and the restored asset-metadata inventory. It fails on a missing or invalid manifest, changed database bytes, inventory mismatch, missing strict pair, or snapshot-identity mismatch.

Older database-only or offline-maintenance backups remain readable for backward compatibility. They return `actionRequired: true` with `asset_snapshot_unpaired`; a non-strict database drill can pass SQLite integrity while retaining that warning. New online and scheduled backups are always paired. Do not treat a database-only pass as proof that asset bytes are recoverable, and do not use an unpaired backup with the reviewed admin restore.

For unattended backups from the API process, set:

```bash
OTTE_SQLITE_BACKUP_RUN_ON_START=true
OTTE_SQLITE_BACKUP_INTERVAL_SECONDS=86400
OTTE_SQLITE_BACKUP_REASON=nightly
OTTE_SQLITE_BACKUP_RETENTION_COUNT=30
```

The SQLite store retains the 30 newest in-process backups by default and prunes older files after each successful backup. Set `OTTE_SQLITE_BACKUP_RETENTION_COUNT` to a value from 1–365 to change the window; keep independent off-volume or provider snapshots for disaster recovery.

Retention pruning removes each expired managed SQLite backup and its matching `.recovery.json` sidecar. The scheduler then removes only application-managed asset snapshots that are no longer referenced by a retained recovery sidecar. It never deletes provider-native asset snapshots; manage their retention with the provider.

The Admin UI and `GET /api/v1/admin/storage/operations` show whether scheduled backups are enabled, the interval, and the latest scheduled run result, including `paired`, managed snapshot identity, captured object count and bytes, and strict restore-drill status. A scheduled run succeeds only after it copies recoverable asset objects into a content-addressed application-managed snapshot, binds that identity to the SQLite recovery sidecar, verifies the captured bytes and checksums, and passes a strict paired restore drill. The paired files live under the configured backup volume; copy them off-volume and retain provider-native snapshots because an in-process backup cannot protect against loss of that volume or provider account.

### Reviewed paired restore through the admin API

For an application-managed snapshot, use `POST /api/v1/admin/storage/restore` rather than restoring SQLite by itself. Keep exactly one API process running for this reviewed request and stop web, workers, schedulers, and every other API replica. Supply an idempotency key, the selected backup filename twice, the current `restoreStateRevision`, and the exact asset snapshot identity from that backup's recovery sidecar.

The API verifies the selected manifest and every captured object before changing SQLite. It creates a fresh paired rollback point for the current database and assets, restores the selected SQLite backup, restores every managed object to its exact provider key, and reads each object back to verify its size and SHA-256. A database or object failure triggers automatic restoration of both halves of the rollback pair. A response with `rollback.status=failed` is a fail-closed incident: keep the deployment unavailable, preserve the restore journal and paired artifacts, and repair storage before retrying. A successful response records both `assetRestore` and `rollbackRecoveryPoint` so the operator can retain the pre-restore recovery set.

```bash
curl -X POST http://127.0.0.1:4000/api/v1/admin/storage/restore \
  -H "Authorization: Bearer $ADMIN_SESSION" \
  -H "Idempotency-Key: incident-restore-1" \
  -H "Content-Type: application/json" \
  --data '{"backupFileName":"opentabletop-2026-07-17T12-00-00-000Z.sqlite","confirmFileName":"opentabletop-2026-07-17T12-00-00-000Z.sqlite","expectedStateRevision":"sha256:CURRENT_REVISION","reason":"incident restore","requireAssetSnapshot":true,"expectedAssetSnapshot":{"provider":"local","snapshotId":"sha256:EXACT_SIDECAR_SNAPSHOT_ID","createdAt":"2026-07-17T12:00:00.000Z"}}'
```

## Asset Backup

The online and scheduled backup paths already capture a verified copy of every recoverable managed object. For defense against loss of the backup volume itself, also copy or snapshot the full local upload directory, or enable S3/MinIO bucket versioning, replication, or provider-native snapshots. Record that supplemental snapshot in operator incident records; the recovery sidecar deliberately identifies the app-managed content-addressed snapshot used by the automated paired restore.

## Campaign Archive Backup

Campaign owners can export portable `.ottx` archives:

```bash
curl -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  "http://localhost:4000/api/v1/campaigns/{campaignId}/export" \
  -o campaign.ottx.json
```

Archive import supports `0.1.0` and `0.2.0`; current exports are `0.2.0`.

## Restore

1. Select the paired backup in `GET /api/v1/admin/storage/operations` and record its exact filename and `recoveryPoint.manifest.assetSnapshot` identity.
2. Stop web, workers, schedulers, and every additional API replica. Leave exactly one API process available only to the reviewing administrator.
3. Run `POST /api/v1/admin/storage/restore-drill` with that exact pair and require a passing result.
4. Refresh `GET /api/v1/admin/storage/operations` and copy the current `restoreStateRevision`.
5. Run the [reviewed paired restore](#reviewed-paired-restore-through-the-admin-api). The API creates a current rollback pair, restores the database and managed objects, reads the objects back by checksum, and rolls both halves back if any step fails.
6. Restore plugin package root and environment configuration from the same recovery point when those changed independently.
7. Restart web, workers, and schedulers only after storage operations, a representative campaign export, and one uploaded map asset pass validation.

If the application-managed snapshot or the entire backup volume was lost, keep the deployment stopped and use the supplemental provider-native/host snapshot plus the offline `storage:maintenance` drill and restore commands. That is a manual disaster-recovery fallback: it restores SQLite only and requires the operator to restore asset bytes separately. Never present an offline SQLite-only pass as evidence that the paired application recovery succeeded.

### Interrupted SQLite Restore Recovery

The destructive SQLite restore writes an append-only `<database>.restore-intent.jsonl` journal beside the live database before it stages or renames any file. Journal entries and staged database bytes are flushed to disk, and containing-directory metadata is flushed on platforms that support directory `fsync`. The journal records every swap, validation, reconciliation, commit, and rollback phase.

On startup, the SQLite store resolves that journal before opening the database. An uncommitted restore is rolled back to the original live database; a journal-committed restore keeps the restored database and finishes artifact cleanup; a completed rollback only finishes cleanup. Recovery keeps the rollback file until the restored original has been flushed and the durable `rolled_back` entry exists, so another process or machine failure during recovery is safe to retry.

If a restore process exits unexpectedly, keep the API and workers stopped and restart the same API version against the same storage directory. Do not rename, delete, or hand-select the `.restore-intent.jsonl`, `.restore-*.stage`, or `.restore-*.rollback` files. If startup rejects a missing, malformed, or inconsistent recovery set, preserve all files and logs for incident review instead of guessing which database is authoritative.

Restore reconciliation takes gameplay and campaign content from the selected backup while preserving the current live authentication, authorization, and administrative control plane. This includes users, session security fields, identities, organizations and membership, invites, campaign permissions and ownership, system installations, and plugin reviews. Pending mail, webhooks, deliveries, and jobs are quarantined or cancelled so a historical restore cannot replay external side effects.

The restore confirmation revision is canonical across record ordering and process restarts. It excludes append-only audit logs and session heartbeat telemetry (`lastSeenAt` and `updatedAt`) so observation traffic does not invalidate an operator confirmation, but it retains session security fields such as token hash, expiration, and active organization. Any other live-state change invalidates the precondition and requires a fresh confirmation.

## Rollback Procedure

Use rollback when an upgrade, migration, import, or maintenance operation fails validation and you need to return to the last known-good deployment.

1. Stop API, web, worker, and scheduled-job processes.
2. Preserve failure evidence before overwriting anything:
   - Copy current API logs.
   - Save `GET /api/v1/admin/storage/operations` output if the API is still reachable.
   - Keep the failed archive/import payload or deployment version identifier.
3. Select the last known-good paired recovery point and inspect its recovery sidecar.
4. Run the reviewed admin restore with the exact database filename, state revision, and app-managed asset snapshot identity. Use provider-native/offline restoration only when the application-managed recovery artifacts were lost.
5. Preserve the automatic pre-restore rollback recovery point until the incident is closed.
6. Restore plugin package root, trust keys, and environment configuration from the same release snapshot.
7. Restart the previous known-good code version.
8. Run recovery checks before reopening the table:
   - `GET /api/v1/campaigns` lists expected campaigns.
   - `GET /api/v1/admin/storage/operations` reports SQLite integrity `ok`.
   - `POST /api/v1/admin/storage/restore-drill` passes against the restored backup set.
   - One representative campaign export succeeds.
   - One GM browser smoke can load the active scene and one uploaded asset.
9. Record the failed version, restored backup filename, manifest filename, exact asset snapshot identity, and validation result in the incident notes.

## Recovery Checks

- `GET /api/v1/campaigns` lists expected campaigns.
- `GET /api/v1/campaigns/{campaignId}/export` returns `format: "ottx"`.
- Uploaded map assets load through `GET /api/v1/assets/{assetId}/blob`.
- `GET /api/v1/admin/assets/storage` shows no unexpected missing storage references.
- Safe content import rollback/delete records remain auditable for applied user-provided imports.
