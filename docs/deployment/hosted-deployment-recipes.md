# Hosted Deployment Recipes

Status: v1.0 candidate operator guidance. Use this with [Self-Hosting](./self-hosting.md), [Backup and Restore](./backup-restore.md), the [Deployment Threat Model](./threat-model.md), and [Security Checklist](./security-checklist.md).

OpenTabletop Engine v1 supports hosted deployments when the platform can provide a durable single-writer SQLite volume, durable asset/plugin storage, stable secrets, TLS, and a way to run background workers. Platforms without durable writable storage are preview-only for v1.

## Production Boundary

Required for production:

- Exactly one API writer attached to the SQLite store.
- Durable storage for `storage/opentabletop.sqlite`, SQLite backups, uploaded assets when not using S3, and local plugin packages.
- A reverse proxy, ingress, or platform edge that terminates TLS and enforces request body limits.
- Secret-manager backed environment variables for session/admin auth, OIDC, SCIM, plugin trust keys, asset signing, webhooks, and dedicated worker principals. APIs receive named worker token hashes; workers receive the corresponding plaintext tokens.
- At least one worker process for backup, restore-drill, import/export, asset cleanup/migration, and AI jobs.
- A documented backup schedule plus a restore drill before upgrades.

Preview-only:

- Ephemeral application filesystems.
- Multiple API replicas sharing one SQLite file.
- Deployments that rely only on campaign archive export for recovery.
- Hosted previews where asset bytes, plugin packages, or SQLite backups are deleted on redeploy.

## Recipe 1: Single VM With systemd

Use this when the host has one persistent disk and you want the smallest production-like footprint.

Layout:

- API: one `open-tabletop-api.service`.
- Web: static build served by the same reverse proxy or a static host.
- Worker: one or more `open-tabletop-worker@N.service` instances.
- Storage: `/srv/open_tabletop_engine/storage` on a backed-up volume.
- Secrets: `/etc/open-tabletop/api.env` and `/etc/open-tabletop/worker.env`, readable only by the service user.

Minimum checks:

```bash
systemctl status open-tabletop-api
systemctl status open-tabletop-worker@1
curl -fsS https://tabletop.example.com/api/v1/health
```

Before upgrading:

```bash
pnpm release:smoke
```

Then create a SQLite backup and run a restore drill from the browser Admin tab or through the storage admin API before replacing the service build.

## Recipe 2: Container Host With Persistent Volumes

Use this when the host already runs containers but you do not need a full orchestrator.

Layout:

- API container: one replica, mounted to durable `api-storage`.
- Web container or static host: any number of replicas.
- Worker container: scaled independently from the API.
- Assets: S3-compatible storage is preferred; durable local upload storage is acceptable for small single-host deployments.
- Secrets: host or container-platform secret store, not image-baked `.env` files.

Operational rules:

- Scale workers, not the API, while SQLite is the v1 store.
- Keep `OTTE_RATE_LIMIT_ENABLED=true` in production and add a shared edge limiter.
- Put SQLite backups on storage that survives container replacement.
- Use health checks for the API and `/api/v1/admin/jobs/operations` for worker posture.
- Use `/api/v1/admin/operations/metrics` and the Admin Hosted Operations section for bounded HTTP, stale-conflict, realtime, durable-write, and recovery counters; follow the [Admin and Observability Checklist](./admin-observability-checklist.md) for incident actions.

Worker scale example:

```bash
OTTE_WORKER_PROFILE_ENABLED=true OTTE_WORKER_TOKEN_HASHES="$OTTE_WORKER_TOKEN_HASHES" OTTE_WORKER_TOKEN="$OTTE_WORKER_TOKEN" OTTE_WORKER_ID=worker-primary docker compose --profile worker up -d --scale worker=3 worker
```

## Recipe 3: Kubernetes-Style Orchestrator

Use this when the platform supports persistent volume claims and secret injection.

Layout:

- API deployment: `replicas: 1`.
- API volume: persistent claim mounted at `/app/storage`.
- Worker deployment: `replicas: N`, each with a unique `OTTE_WORKER_ID`.
- Web deployment: static web replicas or external static hosting.
- Asset storage: S3-compatible object storage with signed delivery URLs.
- Secrets: Kubernetes secrets or the platform equivalent.

Required posture:

- Readiness probe: `GET /api/v1/health`.
- Worker dashboard: `GET /api/v1/admin/jobs/operations`.
- Backup jobs: regular `storage.backup` plus periodic `storage.restoreDrill`.
- Rollback plan: restore SQLite, assets, plugin packages, and environment from the same recovery point.

Do not raise API replicas above one while the active store is SQLite.

## Recipe 4: Managed App Platform With Volumes

Use this when the platform provides a mounted persistent volume, scheduled jobs or background workers, platform secrets, and TLS.

Map the platform features to OpenTabletop responsibilities:

| Platform capability | OpenTabletop requirement |
| --- | --- |
| Web service | One API process with `/api/v1/health` readiness |
| Static site | Built `apps/web` client configured with the public API URL |
| Persistent volume | SQLite store, backups, local uploads if not using S3, and plugin packages |
| Background worker | `@open-tabletop/worker` with `OTTE_WORKER_LEASE_POLL=true` |
| Object storage | `OTTE_ASSET_STORAGE=s3` provider for uploaded assets |
| Secret manager | OIDC, SCIM, plugin trust, asset signing, webhook, and dedicated worker tokens; expose only hashes to the API |
| Scheduled job | Backup and restore-drill job creation or API calls |

If the platform cannot keep the SQLite volume and backup directory across redeploys, treat it as preview-only.

### Railway API Service

For Railway, use the managed-app pattern with one API service, one mounted volume, and optional worker/web services:

- Mount the API service volume at `/app/storage`.
- Keep `railway.api.json` `numReplicas` at `1`.
- Keep `OTTE_SQLITE_PATH=/app/storage/opentabletop.sqlite`, `OTTE_UPLOAD_DIR=/app/storage/uploads`, and `OTTE_PLUGIN_DIR=/app/storage/plugins` so mutable plugin packages share the durable volume.
- Keep startup and daily SQLite backups enabled with `OTTE_SQLITE_BACKUP_RUN_ON_START=true`, `OTTE_SQLITE_BACKUP_INTERVAL_SECONDS=86400`, and `OTTE_SQLITE_BACKUP_REASON=railway-nightly`.
- Run the validation flow in [Railway Persistence](./railway-persistence.md) after the first durable deploy.

## Recipe 5: Static Preview Or Hosted Demo

Use this only for demos, screenshots, and short-lived previews.

Acceptable:

- Web preview pointed at a separate durable API.
- Ephemeral API seeded with demo data.
- No production user promises.
- Campaign archive export before teardown.

Not acceptable for production:

- Storing live campaigns only on an ephemeral filesystem.
- Running plugin registry sync without durable plugin package storage.
- Treating uploaded maps as durable when the host deletes local files on redeploy.
- Running multiple API replicas against one SQLite file.

## Validation Checklist

Before calling a hosted deployment production-ready:

- `pnpm release:smoke` passes from a clean checkout or CI runner.
- `GET /api/v1/health` passes through the public endpoint.
- The first owner bootstrap or login flow works from the hosted web origin.
- `GET /api/v1/admin/storage/operations` reports supported SQLite posture.
- `GET /api/v1/admin/operations/metrics` is server-admin-only, contains no identifiers or private content, and changes during representative HTTP, realtime, durable-write, backup, and restore-drill exercises.
- A SQLite backup succeeds and a restore drill succeeds.
- A worker leases and completes at least one maintenance job.
- Asset upload, signed delivery, archive export, and archive import work.
- Plugin trust policy, asset signing secret, legacy auth, OIDC/SCIM posture, and audit export are reviewed from the Admin tab.
- Installation AI policy is explicitly disabled or fully configured with context scopes, local retention, and provider-transmission disclosure.
- Campaign AI policies are reviewed; a public-only policy cannot transmit GM-private context.
- Local AI privacy preview/prune is exercised without deleting proposals, approved canon memory, or aggregate audit, and no provider-deletion claim is made.
- Hosted alert thresholds, proxy/capacity posture, and the incident drill are measured and recorded for the selected deployment rather than inferred from local counters.
