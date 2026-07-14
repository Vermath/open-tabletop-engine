# Coordinated Recovery Points - 2026-07-13

## Implemented Boundary

- Each managed SQLite backup writes a bounded, versioned recovery sidecar with its database identity, size, SHA-256 checksum, deterministic asset-metadata inventory, and optional operator-supplied provider snapshot identity.
- The API records a snapshot identity only after validating its provider against the active asset provider. It does not create, fetch, or claim to validate the provider snapshot's object bytes.
- Strict drills and destructive restores can require a paired snapshot and confirm its exact provider, snapshot ID, and canonical creation timestamp.
- Restore drills validate the sidecar checksum, database checksum, SQLite integrity, and metadata inventory loaded from the copied database.
- Database-only and legacy backups remain drillable in non-strict mode but explicitly return `actionRequired` and unpaired reasons. Strict mode fails them.
- Retention pruning removes both each expired managed SQLite file and its sidecar.
- Server-admin and scoped-worker authorization remain explicit; destructive restore remains server-admin only and requires exact filename confirmation. Audits include recovery status and identity metadata but no secrets.

## Focused Evidence

- `apps/api/src/sqlite-store.test.ts`: paired manifest creation, strict exact-identity verification, non-strict unpaired reporting, strict rejection, manifest-checksum rejection, inventory mismatch rejection, and sidecar pruning.
- `apps/api/src/app.test.ts`: server-admin pairing route, active-provider validation, strict drill mismatch, paired restore, and audit behavior.
- `packages/api-contracts/src/coordinated-recovery.test.ts`: OpenAPI request and response contracts for versioned manifests and exact identity confirmation.
- `apps/web/src/coordinated-recovery-ui.test.tsx`: operator-visible pairing inputs, database-only warning, and explicit provider-owned snapshot responsibility.

## Focused Results

- SQLite store: 12/12 tests passed.
- Admin storage API route: 1/1 focused test passed.
- Recovery contract: 2/2 tests passed.
- Recovery admin UI: 1/1 test passed.

Hosted provider snapshot creation and an actual production restore remain operator-run deployment evidence. This implementation supplies the contract, durable pairing record, validation gates, and local restore-drill proof without manufacturing external-provider evidence.
