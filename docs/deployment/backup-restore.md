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

## Recovery Checks

- `GET /api/v1/campaigns` lists expected campaigns.
- `GET /api/v1/campaigns/{campaignId}/export` returns `format: "ottx"`.
- Uploaded map assets load through `GET /api/v1/assets/{assetId}/blob`.
- `GET /api/v1/admin/assets/storage` shows no unexpected missing storage references.
- Safe content import rollback/delete records remain auditable for applied user-provided imports.
