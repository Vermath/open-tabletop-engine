# Admin And Observability Checklist

## Before Dogfood

- [ ] Set `OTTE_ADMIN_USER_IDS` for at least one reachable server admin.
- [ ] Verify `GET /api/v1/admin/auth/operations`.
- [ ] Verify `GET /api/v1/admin/assets/storage`.
- [ ] Verify `GET /api/v1/admin/plugins/operations`.
- [ ] Verify `GET /api/v1/admin/systems/operations`.
- [ ] Verify `GET /api/v1/admin/ai/operations`.
- [ ] Export a filtered audit sample through `/api/v1/admin/audit-logs`.

## During Dogfood

- [ ] Watch action reasons in admin operations responses after every session.
- [ ] Confirm realtime disconnects or reconnects are visible to players.
- [ ] Record failed import, asset, AI, plugin, or system actions with the audit id.
- [ ] Keep dogfood feedback tied to campaign id, user id, browser, and exact UTC timestamp.

## After Dogfood

- [ ] Export the campaign archive.
- [ ] Export relevant audit logs as JSON or NDJSON.
- [ ] Export AI evaluation evidence.
- [ ] Save plugin/system operation summaries.
- [ ] Record beta acceptance evidence in `docs/verification/beta-acceptance.md`.
