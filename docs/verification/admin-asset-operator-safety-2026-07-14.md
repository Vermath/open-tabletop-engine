# Admin asset operator safety evidence

Date: 2026-07-14

Scope: non-AI server-admin asset quarantine, migration, cleanup, and CDN purge operations.

## Guarantees

| Operation            | Retry identity              | Concurrency or preparation                                                                                                                           | External delivery                                                                                                                    |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Integrity quarantine | Mandatory `Idempotency-Key` | Dry-run returns a target-set hash over exact asset revisions, integrity evidence, and the normalized quarantine reason; execution requires that hash | Not applicable                                                                                                                       |
| Storage migration    | Mandatory `Idempotency-Key` | Dry-run returns a target-set hash over exact asset revisions, target provider, and migration options; execution requires that hash                   | Each asset receives a stable `assetop_*` operation ID, also forwarded to storage-provider metadata                                   |
| Stored-byte cleanup  | Mandatory `Idempotency-Key` | Dry-run returns a target-set hash over exact asset revisions, cleanup options, and current eligibility; execution requires that hash                 | Not applicable                                                                                                                       |
| CDN purge            | Mandatory `Idempotency-Key` | Requires the exact asset `updatedAt` revision                                                                                                        | Requires a stable `deliveryId` equal to the idempotency key and forwards it in both downstream idempotency headers and the JSON body |

Prepared target sets are rejected with `409 stale_target_set` before an asset-set mutation. Cleanup preparation also becomes stale when time changes an asset's eligibility even if the stored row itself did not change. An explicitly empty `assetIds` array is rejected so it cannot accidentally broaden into an all-assets operation.

Worker migration and cleanup dispatches remain bound to an authenticated, active, exact job lease. Prepared target-set hashes are part of the exact job payload and dispatch comparison; malformed hashes are rejected.

## Focused verification

- API typecheck: passed.
- Worker typecheck: passed.
- Web typecheck: passed.
- Asset route, operation, storage-provider, rendition, and worker-identity tests: 26 passed.
- Worker runner tests: 24 passed.
- Admin asset web-client tests: 3 passed.

The focused tests cover missing retry keys, missing preparations, stale database revisions, changed integrity evidence, time-dependent cleanup eligibility, malformed and over-broad inputs, server-admin denial, exact worker dispatch authorization, stable per-object migration IDs, exact CDN asset revisions, delivery-ID binding, and downstream delivery headers.
