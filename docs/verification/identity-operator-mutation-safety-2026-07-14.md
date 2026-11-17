# Identity operator mutation safety evidence (2026-07-14)

Scope: non-AI server-administration routes for users, password resets, sessions, and email delivery. Existing AI agent behavior and routes were not changed.

## Guarantees

| Route | K | R | P | X |
| --- | --- | --- | --- | --- |
| `PATCH /api/v1/admin/users/{userId}` | Required `Idempotency-Key` | Exact user `expectedUpdatedAt` | — | — |
| `POST /api/v1/admin/users/{userId}/password-reset` | Required key with a route-specific hashed receipt; the secret-bearing response never enters generic replay storage | Exact user `expectedUpdatedAt` | — | Stable persisted email `deliveryId` forwarded in both downstream idempotency headers |
| `POST /api/v1/admin/password-resets/prune` | Required key | — | Dry run returns SHA-256 `targetSetHash` over sorted reset IDs and revisions; execution requires an unchanged hash | — |
| `DELETE /api/v1/admin/users/{userId}/sessions` | Required key | — | `GET .../sessions/revocation-plan` publishes the exact session target-set hash required by delete | — |
| `POST /api/v1/admin/sessions/risk/revoke` | Required key | — | Dry run and unchanged target-set hash | — |
| `POST /api/v1/admin/sessions/prune` | Required key | — | Dry run and unchanged target-set hash | — |
| `DELETE /api/v1/admin/sessions/{sessionId}` | Required key | Exact session `expectedUpdatedAt` | — | — |
| `POST /api/v1/admin/email-outbox/retry-all` | Required key with route-specific batch receipts | — | Dry run and unchanged target-set hash | Stable batch identity plus stable per-message downstream delivery identities |
| `POST /api/v1/admin/email-outbox/{messageId}/retry` | Required key with a route-specific hashed receipt | Exact message `expectedUpdatedAt` | — | Stable persisted delivery identity |

`K` is retry identity, `R` is an exact entity revision, `P` is a prepared target set, and `X` is an external-delivery identity.

## External delivery behavior

- Every webhook attempt sends the same logical message identity in `Idempotency-Key` and `X-Open-Tabletop-Delivery-Id`.
- `deliveryAttempts` and `lastDeliveryAttemptAt` are persisted for diagnostics.
- The delivery identity and operator receipt are saved before dispatch, closing the local crash window while allowing the downstream provider to suppress a duplicate.
- Internal hashed operator receipts are removed from public email-outbox projections.
- Password-reset and email responses remain excluded from the generic response ledger because their persisted message bodies can contain reset credentials. Repeated operator keys are deduplicated from safe route-specific receipts instead.

## Client behavior

The admin UI uses `apps/web/src/admin-identity-client.ts` for these mutations. Entity actions send the displayed exact revision. Bulk actions first obtain a dry-run/plan hash and then execute with that exact hash. Every logical action receives a client-generated idempotency key.

## Executable evidence

- `apps/api/src/admin-identity-api.test.ts`: strict runtime/OpenAPI integration, missing key, stale revision, changed target set, secret non-replay, stable downstream headers.
- `apps/api/src/admin-identity-routes.test.ts`: route behavior and route-specific deduplication.
- `apps/api/src/admin-identity-operations.test.ts`: pure revision and target-set mutation invariants.
- `apps/api/src/email-outbox.test.ts`: delivery identities, receipts, replay, and downstream headers.
- `packages/api-contracts/src/admin-identity-operator-contract.test.ts`: required OpenAPI headers, request preconditions, plan route, and response fields.
- `apps/web/src/admin-identity-client.test.ts`: UI K/R/P request wiring.

Focused validation at implementation handoff:

- API identity tests: 4 files, 16 tests passed.
- API contract tests: 3 files, 39 tests passed.
- Web identity client tests: 1 file, 2 tests passed.
- `@open-tabletop/api` typecheck passed.
- `@open-tabletop/web` typecheck passed.
- `@open-tabletop/api-contracts` build passed.
