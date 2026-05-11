# Upgrade Guide

## Public Alpha v0.1 To Beta v0.2

1. Stop API and worker processes.
2. Back up the SQLite database and asset storage using `docs/deployment/backup-restore.md`.
3. Pull the beta v0.2 code.
4. Run `pnpm install --frozen-lockfile`.
5. Run `pnpm check`.
6. Start the API and web clients.
7. Export one representative alpha campaign and confirm the exported archive reports `version: "0.2.0"` and `manifest.schemaVersion: "0.2.0"`.
8. Import that exported archive into a fresh local runtime before using it as production recovery material.

## Archive Compatibility

- `0.1.0` alpha archives are accepted by `POST /api/v1/import/campaign`.
- `0.2.0` archives are accepted by `POST /api/v1/import/campaign`.
- New exports are written as `0.2.0`.
- Unsupported archive versions return `400 unsupported_archive_version`.

## Operational Notes

- Campaign archives intentionally omit operational auth/session material such as login sessions, identity provider state, password reset tokens, and email outbox records.
- Plugin reviews remain server-local operations data and are not imported from campaign archives.
- Deleted content import previews are omitted from new campaign exports; applied or rolled-back preview records remain campaign-local evidence until deleted.
- Safe content import is separate from full campaign archive import. Use the preview/apply/rollback endpoints for user-provided actor/item/journal/handout content instead of stuffing partial content into archive files.

## Rollback

If beta startup or validation fails:

1. Stop API and worker processes.
2. Restore the pre-upgrade SQLite database and asset storage.
3. Restart the previous code version.
4. Re-export the affected campaign and keep the failed beta archive plus API logs for triage.
