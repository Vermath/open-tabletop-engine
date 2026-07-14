# Non-AI Mutation Route Contract

Date: 2026-07-14
Executable contracts: `apps/api/src/mutation-route-contract.test.ts`, `apps/api/src/get-read-side-effect-contract.test.ts`

## Final status

The non-AI API mutation surface is exhaustively classified and the contract is green. Static extraction locks **246** `POST`, `PUT`, `PATCH`, and `DELETE` routes after excluding the explicit AI-agent boundary. The inventory is not a sample: adding, removing, duplicating, or relocating a route changes the locked count and requires an intentional contract decision.

Focused result:

```text
apps/api/src/mutation-route-contract.test.ts           5 passed
apps/api/src/get-read-side-effect-contract.test.ts     4 passed
```

No AI route, provider, tool, proposal flow, or governed automatic-execution behavior was changed by this contract.

## Locked route inventory

| Source | Non-AI mutations |
| --- | ---: |
| `app.ts` | 202 |
| `calculation-override-routes.ts` | 2 |
| `campaign-session-routes.ts` | 5 |
| `campaign-webhook-routes.ts` | 7 |
| `scene-delegation-routes.ts` | 1 |
| `dnd-monster-variant-routes.ts` | 6 |
| `admin-identity-routes.ts` | 9 |
| `scim-routes.ts` | 10 |
| `admin-asset-routes.ts` | 4 |
| **Total** | **246** |

`archive-operations.ts` and `asset-operations.ts` are also scanned and currently contribute no directly registered routes. Duplicate method/path pairs fail the contract.

## Contract vocabulary

Durable campaign mutations must use one of the following explicit models:

- **Central shared mutation:** mandatory `Idempotency-Key`, exact current record revision, ordinary route authorization, structured stale-write conflict, and safe replay.
- **Specialized shared mutation:** the same guarantees proven by a route-specific helper, exact revision map, or prepared-preview identity when a single record revision is insufficient.
- **Independent append:** mandatory `Idempotency-Key`; a parent revision is omitted only when the operation creates an independent record without deriving from or overwriting mutable source state.
- **Pure probe/preview:** no durable primary-state mutation; any security audit is appended through the narrow serialized audit path.
- **Authentication/session lifecycle:** an explicitly classified identity state machine rather than an accidental campaign mutation exemption.
- **AI boundary:** the existing proposal lifecycle, scene AI edit application, and PDF AI import remain governed by their existing AI contracts and are intentionally unchanged.

The operator/external-authority vocabulary is explicit per route:

| Symbol | Guarantee |
| --- | --- |
| **K** | Mandatory retry/idempotency key |
| **R** | Exact entity, state, registry, review, lease, or HTTP validator revision |
| **P** | Prepared target-set or transition identity |
| **X** | Stable outbound delivery identity so retries cannot duplicate an external effect |

## Operator and external-authority closure

The test locks **39** operator/external-authority routes: **37 mutations** with declared K/R/P/X requirements and **2 read-only probes** (`admin/auth/test-connection` and `admin/storage/restore-drill`). Runtime source and OpenAPI are both checked for every declared guarantee.

Covered streams:

- Identity, sessions, password-reset issuance/pruning, and email retry: K/R/P/X with replay-safe delivery identity.
- Storage backup and destructive restore: backup K; restore K/R.
- Jobs, leases, heartbeats, retries, cancellation, and alerts: K/R/P/X with exact lease revisions and stable alert delivery identity.
- Plugin review, package/registry sync, install, and system install: K/R with exact registry/review revisions where applicable.
- SCIM users, groups, and group-role mappings: K/R/P, mandatory strong `If-Match` validators for updates/deletes, restart-safe replay, and prepared mapping target hashes.
- Asset migration, cleanup, integrity quarantine, and CDN purge: K/R/P/X with prepared target sets and stable purge delivery identity.

Focused evidence:

- [Identity operator mutation safety](identity-operator-mutation-safety-2026-07-14.md)
- [Plugin and system operator mutation safety](plugin-system-operator-mutation-safety-2026-07-14.md)
- [Admin asset operator mutation safety](admin-asset-operator-safety-2026-07-14.md)
- [Storage operator mutation safety](storage-operator-mutation-safety-2026-07-14.md)
- Job lease/runtime coverage: `apps/api/src/admin-job-concurrency.test.ts`, `apps/worker/src/index.test.ts`, and `packages/api-contracts/src/admin-job-concurrency-contract.test.ts`
- SCIM runtime/replay coverage: `apps/api/src/scim-routes.test.ts`, `apps/api/src/scim-idempotency-integration.test.ts`, and `packages/api-contracts/src/scim-operator-contract.test.ts`

## GET read-side-effect closure

The companion read contract locks the previously audited **21-route** inventory. OIDC callback is the sole explicit state-mutating GET transaction because it completes authentication and creates/links a session. Every other audited GET is now primary-state read-only or sends its security audit through the narrow, serialized append-only audit helper; unclassified direct `store.save`, pruning, primary-state assignment, collection mutation, or legacy audit append fails the test.

## Remaining boundary

There are no known code-addressable mutation-contract gaps in the locked non-AI route surface. Hosted multi-process behavior, live identity providers, and real external delivery systems still require deployment evidence; they are release evidence gates, not code exemptions. Any new route must extend this executable inventory and prove its retry, conflict, prepared-transition, outbound-delivery, or pure-probe classification.
