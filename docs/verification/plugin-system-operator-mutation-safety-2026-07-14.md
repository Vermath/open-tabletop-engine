# Plugin and system operator mutation safety - 2026-07-14

## Implemented guarantees

- `POST /api/v1/plugins/install` requires an `Idempotency-Key`, server-admin authority, and campaign `plugin.install`. Successful registration writes a redacted audit summary that excludes local package paths, registry package URLs, and package contents. Same-key retries replay without registering or auditing twice; a changed payload with the same key conflicts.
- Campaign and admin registry sync require an `Idempotency-Key` plus the exact `expectedRegistryRevision`. The compare-and-swap check and import are serialized across both routes, so competing work from one generation produces one winner and one `409` stale response. Successful results and redacted audit rows carry the previous and resulting revisions.
- Plugin review changes require an `Idempotency-Key` plus the exact `expectedUpdatedAt` from the selected review. Stale decisions return `409`; safe retries replay once.
- `POST /api/v1/systems/install` requires an `Idempotency-Key` and retains its existing dual server-admin and campaign permission boundary.
- Admin Plugin Reviews and Plugin Operations expose the current `registryRevision`. The browser and typed clients pass these preconditions and idempotency keys rather than issuing blind writes.
- The OpenAPI schemas require these headers and preconditions and describe the revision-bearing responses.

The existing AI agent behavior and AI routes were not changed by this work.

## Focused verification

- `pnpm --filter @open-tabletop/api exec vitest run src/plugin-system-operator.test.ts src/plugin-system-operator-api.test.ts --silent` - 7 passed.
- `pnpm --filter @open-tabletop/api typecheck` - passed before shared asset-route integration resumed.
- `pnpm --filter @open-tabletop/api-contracts exec vitest run src/plugin-system-operator-contract.test.ts` - 2 passed.
- `pnpm --filter @open-tabletop/web exec vitest run src/admin-plugin-client.test.ts` - 2 passed.
- `pnpm --filter @open-tabletop/api-client typecheck` - passed.
- `pnpm --filter @open-tabletop/api-client exec vitest run src/index.test.ts -t "uses the server plugin envelopes|sends mandatory idempotency identity"` - 2 passed, 20 skipped by the name filter.

The focused API suite covers missing-key rejection, dual-authority denial, redacted audit fields, replay, key-reuse conflict, stale review rejection, exposed registry generations, competing registry sync serialization, stale sync rejection, and winning-response replay.
