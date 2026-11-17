# Storage Operator Mutation Safety

Date: 2026-07-14

## Contract

- `POST /api/v1/admin/storage/backup` requires a stable `Idempotency-Key`. An exact retry is served from the durable idempotency ledger and returns the original backup receipt instead of creating another backup file.
- `POST /api/v1/admin/storage/restore` requires both a separate `Idempotency-Key` and the canonical `expectedStateRevision` returned by `GET /api/v1/admin/storage/operations`. A stale state revision fails before the live database is replaced.
- `POST /api/v1/admin/storage/restore-drill` verifies a copied backup and optional paired asset-snapshot identity without replacing live state. It remains an explicitly classified verification probe rather than a destructive operator transition.
- Interrupted destructive restore uses the fsynced append-only restore-intent journal documented in `docs/deployment/backup-restore.md`; startup recovery is idempotent across prepared, swapped, validated, committed, and rolled-back phases.

The strict OpenAPI contract publishes the mandatory backup and restore idempotency headers and the restore revision request. The Admin UI sends a fresh backup key and reuses the normal guarded request path. Worker-dispatched backups use the scoped worker request identity as the same retry boundary.

## Executable evidence

- `apps/api/src/app.test.ts` — the SQLite storage workflow rejects a missing backup key, creates one paired recovery point, replays the exact request with `Idempotency-Replayed: true`, drills it, and performs a non-no-op revision-confirmed restore.
- `apps/api/src/sqlite-restore-safety.test.ts` — crash/restart recovery, rollback, security-plane preservation, and canonical revision coverage.
- `apps/api/src/mutation-route-contract.test.ts` — explicit storage K/R classification and required OpenAPI evidence.
- `packages/api-contracts/src/coordinated-recovery.test.ts` — restore request/response contract coverage.

Focused verification during implementation:

```text
pnpm --filter @open-tabletop/api exec vitest run src/app.test.ts -t "reports sqlite storage operations and runs backup restore drills"
1 passed, 249 skipped

pnpm --filter @open-tabletop/api exec vitest run src/mutation-route-contract.test.ts
5 passed
```

Hosted provider backup/restore, migration, rollback, and asset-snapshot evidence remains an external release gate; this record proves the local transaction contract only.
