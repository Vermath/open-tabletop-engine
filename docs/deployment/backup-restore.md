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
- An optional exact asset snapshot identity supplied by the operator: provider, snapshot ID, and creation time.

The API does not create a local-volume, S3, MinIO, Railway, or other provider snapshot. Create that snapshot with the provider's tooling first. Pause table mutations and background asset work while taking the provider snapshot and SQLite backup so the two represent one recovery window. Then record the provider's non-secret snapshot identity:

```bash
IDEMPOTENCY_KEY="$(uuidgen)"
curl -X POST -H "Authorization: Bearer $OTTE_SESSION_TOKEN" -H "Idempotency-Key: $IDEMPOTENCY_KEY" -H "content-type: application/json" \
  -d '{"reason":"pre-upgrade","requireAssetSnapshot":true,"assetSnapshot":{"provider":"s3","snapshotId":"bucket-version-2026-07-13-001","createdAt":"2026-07-13T18:30:00.000Z"}}' \
  http://127.0.0.1:4000/api/v1/admin/storage/backup
```

`provider` must exactly match the active asset provider (`local` or `s3`). Snapshot IDs are bounded to 200 visible characters and are identifiers, not credentials. Never put an access key, session token, signed URL, or other secret in this field.

Online backup creation requires an `Idempotency-Key`. Reuse the same key only when retrying the exact same request; a successful replay returns the original backup receipt instead of creating another backup file.

Run a strict restore drill by confirming that exact identity:

```bash
curl -X POST -H "Authorization: Bearer $OTTE_SESSION_TOKEN" -H "content-type: application/json" \
  -d '{"backupFileName":"opentabletop-2026-07-13T18-30-01-000Z.sqlite","requireAssetSnapshot":true,"expectedAssetSnapshot":{"provider":"s3","snapshotId":"bucket-version-2026-07-13-001","createdAt":"2026-07-13T18:30:00.000Z"}}' \
  http://127.0.0.1:4000/api/v1/admin/storage/restore-drill
```

The drill verifies the sidecar checksum, SQLite file identity and checksum, SQLite integrity, and the restored asset-metadata inventory. It fails on a missing or invalid manifest, changed database bytes, inventory mismatch, missing strict pair, or snapshot-identity mismatch.

Database-only backups remain available for backward compatibility. They return `actionRequired: true` with `asset_snapshot_unpaired`; a non-strict database drill can pass SQLite integrity while retaining that warning. `requireAssetSnapshot: true` converts a missing pair into a failed drill. Do not treat a database-only pass as proof that asset bytes are recoverable.

For unattended backups from the API process, set:

```bash
OTTE_SQLITE_BACKUP_RUN_ON_START=true
OTTE_SQLITE_BACKUP_INTERVAL_SECONDS=86400
OTTE_SQLITE_BACKUP_REASON=nightly
OTTE_SQLITE_BACKUP_RETENTION_COUNT=30
```

The SQLite store retains the 30 newest in-process backups by default and prunes older files after each successful backup. Set `OTTE_SQLITE_BACKUP_RETENTION_COUNT` to a value from 1–365 to change the window; keep independent off-volume or provider snapshots for disaster recovery.

Retention pruning removes each expired managed SQLite backup and its matching `.recovery.json` sidecar. It never deletes provider-native asset snapshots; manage their retention with the provider.

The Admin UI and `GET /api/v1/admin/storage/operations` show whether scheduled backups are enabled, the interval, and the latest scheduled run result. Keep host-level snapshots for disaster recovery; the in-process scheduler only creates SQLite backup files and recovery sidecars in the configured storage volume. Scheduled backups are intentionally marked unpaired because the application does not own provider snapshot creation.

## Asset Backup

For local disk assets, copy or snapshot the full upload directory while the API is stopped or mutations are paused. For S3/MinIO, use provider-native bucket versioning, replication, or snapshot tooling. Keep the asset backup timestamp aligned with the SQLite backup timestamp, and record its exact identity in the recovery sidecar so operators cannot silently select a different snapshot during a strict drill or restore.

## Campaign Archive Backup

Campaign owners can export portable `.ottx` archives:

```bash
curl -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  "http://localhost:4000/api/v1/campaigns/{campaignId}/export" \
  -o campaign.ottx.json
```

Archive import supports `0.1.0` and `0.2.0`; current exports are `0.2.0`.

## Restore

1. Pause table mutations and background asset work. Create the provider-native asset snapshot and a paired SQLite backup while they still represent one recovery window.
2. Select the SQLite backup and read its `.recovery.json` sidecar. Record the exact backup filename and asset snapshot identity.
3. Stop API, web, worker, and scheduled-job processes. Keep them stopped through the SQLite restore.
4. Restore the exact asset snapshot named by `assetSnapshot` using provider tooling.
5. Run a strict drill directly against the stopped deployment's SQLite storage. Supply the exact sidecar identity:

   ```bash
   pnpm --filter @open-tabletop/api storage:maintenance -- drill \
     --database storage/opentabletop.sqlite \
     --backup opentabletop-2026-07-13T18-30-01-000Z.sqlite \
     --require-asset-snapshot \
     --asset-provider s3 \
     --asset-snapshot-id bucket-version-2026-07-13-001 \
     --asset-snapshot-created-at 2026-07-13T18:30:00.000Z
   ```

6. Only after the drill passes, restore that same SQLite file offline. `--confirm-file-name` must exactly match `--backup`:

   ```bash
   pnpm --filter @open-tabletop/api storage:maintenance -- restore \
     --database storage/opentabletop.sqlite \
     --backup opentabletop-2026-07-13T18-30-01-000Z.sqlite \
     --confirm-file-name opentabletop-2026-07-13T18-30-01-000Z.sqlite \
     --require-asset-snapshot \
     --asset-provider s3 \
     --asset-snapshot-id bucket-version-2026-07-13-001 \
     --asset-snapshot-created-at 2026-07-13T18:30:00.000Z \
     --reason incident-restore
   ```

7. Restore plugin package root and environment configuration from the same recovery point.
8. Start the API and workers.
9. Run a campaign export and a small browser smoke before resuming play.

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
3. Select the last known-good SQLite backup and inspect its recovery sidecar.
4. Restore the exact asset snapshot identity recorded in that sidecar.
5. While every application process remains stopped, run `storage:maintenance -- drill` and then `storage:maintenance -- restore` with the exact same backup filename and strict asset snapshot identity.
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
