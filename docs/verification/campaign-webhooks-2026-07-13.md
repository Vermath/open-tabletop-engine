# Campaign webhook verification - 2026-07-13

## Delivered surface

- Nine stable `/api/v1` OpenAPI operations for outbound campaign webhook create, list, edit, disable, delete, secret rotation, manual test, metadata ledger, and failed-delivery retry.
- Public schemas omit stored signing secrets, internal idempotency hashes, request/response bodies, and signing headers. The versioned `1.0` envelope is metadata-only.
- Typed `@open-tabletop/api-client` methods carry exact revisions and a caller-supplied `Idempotency-Key` on every mutation.
- The campaign manager exposes an accessible `campaign.update`-gated GM surface with abortable list/ledger loads, local errors, explicit confirmations, event selection, edit/disable/delete, one-time secret copy guidance, rotation, manual diagnostics, and a bounded delivery ledger.
- Disabled subscriptions stop automatic dispatch while retaining explicit GM test/retry diagnostics.
- REST and deployment-security documentation includes exact signing headers, raw-body HMAC-SHA256 verification, constant-time comparison, timestamp replay protection, event-id deduplication, one-time-secret handling, and the outbound-only/no-inbound-mutation boundary.
- Webhook management remains human-confirmed and excluded from direct MCP mutation.

## Safety invariants

1. Creation and rotation return plaintext secrets only once; safe replays return `signingSecretAlreadyShown: true`.
2. The browser never sends a plaintext secret back to OpenTabletop, stores it in browser storage, or includes it in status messages.
3. Every write carries the current campaign/webhook revision and a retry-stable idempotency key.
4. Loads are aborted on campaign, ledger, or component changes; errors stay local to the affected form or ledger.
5. Delivery history is metadata only and limited to the newest 50 entries in the GM surface.
6. A receiver verifies the exact raw bytes before JSON parsing, rejects stale timestamps, compares signatures in constant time, and deduplicates `eventId` before side effects.
7. A webhook delivery grants no authority to mutate campaign state. Any separate write still uses authenticated REST permissions and revisions.

## Verification evidence

- `node scripts/run-package-manager.mjs --filter @open-tabletop/api-contracts typecheck` - passed.
- `node scripts/run-package-manager.mjs --filter @open-tabletop/api-contracts test` - 7 files, 39 tests passed, including 4 focused webhook contract tests.
- `node scripts/run-package-manager.mjs --filter @open-tabletop/api-client typecheck` - passed.
- `node scripts/run-package-manager.mjs --filter @open-tabletop/api-client test -- campaign-webhook-client.test.ts` - 1 focused test passed.
- `node scripts/run-package-manager.mjs --filter @open-tabletop/api-client test -- index.test.ts` - 20 tests passed, including complete public OpenAPI route coverage.
- `node scripts/run-package-manager.mjs --filter @open-tabletop/web typecheck` - passed.
- `node scripts/run-package-manager.mjs --filter @open-tabletop/web test -- campaign-webhooks-panel.test.tsx` - 3 tests passed.
- `git diff --check` for the webhook contract/client/web/docs files - passed.
- The targeted API auth and malformed-request matrix covers all nine webhook routes. Its stateful webhook-create fixture intentionally expects `409` when the reviewed request conflicts with current campaign state; the reconciled full API suite passes that contract.
