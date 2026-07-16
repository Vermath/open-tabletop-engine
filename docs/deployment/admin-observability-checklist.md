# Admin And Observability Checklist

`GET /api/v1/admin/operations/metrics` and the **Hosted Operations** section of the Admin tab expose process-local, fixed-dimension counters for HTTP requests, 5xx responses, stale-write conflicts, HTTP latency, realtime connections/disconnects/send failures and heartbeat delivery gaps, durable-write outcomes/latency, and backup/restore outcomes. The payload never includes campaign ids, user ids, credentials, request paths, private content, or other unbounded labels. Metrics are enabled by default; set `OTTE_OPERATIONS_METRICS=false` only when the host supplies equivalent instrumentation.

## Before Dogfood

- [ ] Set `OTTE_ADMIN_USER_IDS` for at least one reachable server admin.
- [ ] Verify `GET /api/v1/admin/auth/operations`.
- [ ] Verify `GET /api/v1/admin/assets/storage`.
- [ ] Verify `GET /api/v1/admin/plugins/operations`.
- [ ] Verify `GET /api/v1/admin/systems/operations`.
- [ ] Verify `GET /api/v1/admin/ai/operations`.
- [ ] Verify `GET /api/v1/admin/operations/metrics` as a server admin and verify a non-admin receives `403`.
- [ ] Export a filtered audit sample through `/api/v1/admin/audit-logs`.

## During Dogfood

- [ ] Watch action reasons in admin operations responses after every session.
- [ ] Record the Hosted Operations counters before and after the session so HTTP failures, stale conflicts, realtime disconnects and durable-write outcomes can be compared.
- [ ] Confirm realtime disconnects or reconnects are visible to players and that disconnect/send-failure counters and the heartbeat-gap histogram move as expected.
- [ ] Record failed import, asset, AI, plugin, or system actions with the audit id.
- [ ] Keep dogfood feedback tied to campaign id, user id, browser, and exact UTC timestamp.

## After Dogfood

- [ ] Export the campaign archive.
- [ ] Export relevant audit logs as JSON or NDJSON.
- [ ] Export AI evaluation evidence.
- [ ] Save plugin/system operation summaries.
- [ ] Record beta acceptance evidence in `docs/verification/beta-acceptance.md`.

## Measured Operational Retention

Preservation is the default. `GET /api/v1/admin/retention/operations` measures only terminal delivered-email, delivered-webhook, and maintenance-job ledgers. It never marks canonical campaign state, audit logs, active idempotency records, failed/retryable work, campaign exports/imports, or archive-import recovery operations eligible.

If measured volume justifies cleanup, a server admin uses `POST /api/v1/admin/retention/prune` twice: first with `dryRun: true`, then with `dryRun: false`, the unchanged `targetSetHash`, and a 10–500 character operator reason. The response lists every selected record id and completion time, deletes at most the requested bounded batch, and reports the remainder. A changed target set returns `409`; preview again instead of forcing the old plan. Every execution is idempotency-protected and audited. The Admin **Measured Retention** section exposes the same workflow.

- [ ] Record the measured class counts and recovery point that justify pruning.
- [ ] Review every exact selected id and completion time in the dry run.
- [ ] Confirm failed/retryable work, audit, active idempotency, and archive recovery are absent from the plan.
- [ ] Execute one bounded batch with a stable reason, then preview again before continuing.
- [ ] Compare storage measurements and inspect retained audit/recovery samples afterward.

## Incident Actions

The counters are cumulative for the current API process. Compare a recent known-good snapshot with the current snapshot; do not treat a historical nonzero counter as a current outage. Production thresholds and paging rules must be based on measured hosted traffic rather than invented repository defaults.

| Signal | Immediate action | Recovery proof |
| --- | --- | --- |
| `http.errorResponses` rises | Correlate the UTC window with redacted host/API logs, health checks, and the affected public operation. Do not add route, user, or campaign labels to metrics. | A representative request passes and the counter no longer rises during the same exercise. |
| `http.staleWriteConflicts` rises | Confirm clients refresh the latest revision and retry only after review; inspect whether one browser or automation is holding stale state. | The refreshed mutation succeeds once without overwriting newer state. |
| `realtime.disconnections`, `realtime.sendFailures`, or `realtime.heartbeatGapMs` rises | Inspect ingress WebSocket upgrade/timeout posture, API health, client reconnect behavior, and heartbeat gaps relative to the first-party client's 15-second cadence. | GM and player reconnect, heartbeat gaps return to the measured healthy range, they receive a new live event, and no session credential appears in the URL or logs. |
| `persistence.failed` rises or write latency changes materially | Stop risky maintenance, verify durable volume health and free space, inspect redacted persistence errors, and create a recovery point before restart when the store is healthy enough. | A real durable mutation survives an API restart and the paired recovery drill passes. |
| backup, restore-drill, or restore failures rise | Follow [Backup and Restore](./backup-restore.md), verify the exact database checksum and asset inventory/snapshot identity, and do not replace live state with an unverified copy. | A fresh paired backup and strict restore drill pass; provider-native asset restore evidence is recorded separately. |

The repository supplies counters, the server-admin dashboard, and these actions. Hosted alert delivery, capacity thresholds, proxy evidence, and an operator-executed incident drill remain deployment-specific evidence.
