# Architecture Risks

> Post-remediation register, 2026-07-14. Historical findings are represented by their current disposition rather than retained as duplicated “open” sections. AI behavior is an accepted product-owner boundary and was not reduced or redesigned by this non-AI program.

## Scale and disposition

| Disposition | Meaning |
| --- | --- |
| Mitigated in code | The verified counterexample is closed and guarded by tests; regressions remain possible |
| Residual / monitored | The chosen architecture retains a bounded cost that does not justify a broader rewrite today |
| Evidence-gated | Local code exists, but only external infrastructure or human evidence can close the release risk |
| Accepted product boundary | Deliberately retained behavior or scope; monitor without changing it indirectly |

Severity reflects impact if the mitigation fails: Critical, High, Medium, or Low.

## Ranked risk register

| ID | Risk | Severity / disposition | User and technical impact | Current mitigation and evidence | Remaining action |
| --- | --- | --- | --- | --- | --- |
| AR-01 | Incorrect rules mutation corrupts authoritative character/combat state | Critical / Mitigated in code | A player or DM trusts a successful advancement, rest, damage, condition, attunement or effect result that is wrong | Prepared server transactions, versioned validation, resolution hashes, exact actor/item/combat revisions, idempotency, audit and stale-safe undo; `p0-rules.test.ts`, `p0-core-loop-integration.test.ts`, `typed-damage-combat-sync.test.ts` | Keep every discovered counterexample as a regression; real-session evidence |
| AR-02 | Shared writes silently overwrite newer state | Critical / Mitigated in code | Concurrent edits disappear and clients converge to the wrong value | [Exhaustive 246-route contract](verification/non-ai-mutation-route-contract-2026-07-13.md), exact revisions/prepared targets, K/R/P/X operator contracts, structured 409/current-state responses and mutation coordinator | Monitor conflict rate and UX in real groups |
| AR-03 | Archive accepts invalid or inconsistent D&D records | Critical / Mitigated in code | Restore reports success but creates an unusable campaign | Full schema/type/required/reference/domain/checksum validation before mutation; `archive-validation.ts`, `archive-dnd-validation.test.ts` | Maintain N-1 and malicious fixtures as schema evolves |
| AR-04 | Archive/state/object restore is partially applied | Critical / Mitigated in code | Campaign records and asset bytes disagree after failure | Temp staging, prewrite snapshots, atomic state publish, compensating object rollback, cancellation and recovery tests | Prove target-host restore/rollback drill |
| AR-05 | Critical acknowledgement precedes durable SQLite state | Critical / Mitigated in code | UI reports success but restart loses the write | Serialized persistence coordination, commit-safe dirty baseline, rollback/retry and restart tests in `sqlite-store.ts` | Production storage/failure telemetry |
| AR-06 | Full-state SQLite persistence burns CPU/memory or misses nested changes | High / Mitigated in code | Session latency grows or changes are not flushed | Structural dirty tracking detects nested/array/shape changes without per-flush full SELECT/stringify; maintenance/capacity tests | Observe real campaign size and checkpoint behavior |
| AR-07 | Realtime gaps, duplicates or privacy leakage | Critical / Mitigated in code | Clients miss state, apply twice, or see private GM/actor data | Monotonic sequence, bounded filtered history, delta reconciliation, permission-filtered snapshots, presence and lifecycle tests | Hosted partitions/latency observation |
| AR-08 | Large campaign archives exhaust API memory | High / Mitigated in code | Export/import crashes the single writer during recovery | Additive framed raw-byte streaming, backpressure, per-file/aggregate/header caps, incremental SHA-256, temp staging and deterministic buffer metrics in `archive-stream.ts`; legacy JSON capped for compatibility | Prefer stream client for large campaigns; hosted near-limit test |
| AR-09 | OIDC discovery/linking leaks credentials or captures privileged identity | Critical / Mitigated in code | Account takeover or token delivery to attacker-controlled/internal endpoint | Verified-email policy, privileged-account protection, HTTPS/issuer/endpoint validation, redirect/DNS/IP/SSRF controls in `oidc-http-security.ts` | Live IdP sandbox and independent review |
| AR-10 | Worker or automation gains server-admin authority | Critical / Mitigated in code | Compromise becomes installation-wide mutation | Scoped worker identity and allowlisted command translation in `worker-identity.ts`; authorization matrix tests | Rotate/monitor credentials in target deployment |
| AR-11 | Production readiness is green while required secrets/storage are unusable | High / Mitigated in code | Traffic reaches a service unable to sign assets or persist safely | Central configuration validation and fail-closed readiness/deployment smoke | Hosted HTTPS/object-store smoke |
| AR-12 | Signed URLs, tokens or provider secrets enter logs | High / Mitigated in code | Bearer access or provider credentials leak through diagnostics | Request/log redaction, safe reason codes, URL/token filters and tests | Verify external log/trace pipeline transformations |
| AR-13 | API, web and rules composition roots concentrate change risk | High / Residual | Small changes have broad review/test blast radius; bundles/builds slow | Extracted domain panels/routes/static-data modules, explicit dependency injection, architecture and bundle budgets; current roots are materially smaller than audit baseline | Extract only coherent transaction/domain seams found by real work; do not rewrite for line count alone |
| AR-14 | OpenAPI and runtime behavior drift | High / Mitigated in code | Clients send accepted-looking invalid data or parse undocumented responses | Shared contracts, request location-aware compiler, strict JSON bodies, non-AI response validation, [runtime/OpenAPI K/R/P/X inventory](verification/non-ai-mutation-route-contract-2026-07-13.md), and client tests | Version compatibility discipline; monitor validation errors |
| AR-15 | Plugin code escapes campaign capability boundary | Critical / Residual within trusted-admin scope | Hostile code reads/writes beyond grant or harms the process | Signed-by-default production policy, capability intersection, typed application commands, permission/revision/audit, runtime isolation and threat model | Do not market as adversarial marketplace; process/container isolation before hostile ecosystem |
| AR-16 | Webhook integration becomes an inbound mutation or SSRF channel | High / Mitigated in code | Campaign data changes remotely or delivery reaches internal services | Outbound-only allowlist, HMAC, one-time secret, pinned DNS/SSRF checks, absolute deadline, bounded queue/ledger, retry/audit and archive redaction in `campaign-webhooks.ts` | Hosted endpoint interoperability and operational monitoring |
| AR-17 | AI follows untrusted campaign content, leaks context, or overstates a mutation | High / Accepted product boundary with controls | Model output can be manipulated or sent beyond expected scope | Existing permission/tool boundaries, untrusted-content labels, citations, context scoping, retention/privacy diagnostics, audit, manual proposal and governed automatic modes | Monitor incidents/evaluations; capability or governance redesign requires an explicit AI task, not indirect safety wording |
| AR-18 | Bundled/user content lacks valid provenance or attribution | High / Evidence-gated | Distribution creates legal risk or users cannot distinguish official, homebrew and generated content | Per-record source/version/license/usage, package `CONTENT_NOTICE.md`, archive preservation, duplicate/conflict handling | Release-owner/legal review; ship only redistributable or user-supplied content |
| AR-19 | Migration/backup tests do not match target hosting | Critical / Evidence-gated | Upgrade or incident recovery fails despite local green tests | Local golden/current fixtures, backups, retention, restore drill, coordinated assets and rollback runbooks | Execute and record hosted forward migration, restore and rollback |
| AR-20 | Automated accessibility misses real assistive-technology failure | High / Evidence-gated | Keyboard/screen-reader/touch users cannot run a session | Responsive/keyboard/label/focus/status/browser regressions and supported-browser boundary | Manual NVDA, Narrator, VoiceOver, TalkBack and physical device passes |
| AR-21 | Local capacity envelope is mistaken for a production SLO | High / Evidence-gated | Real groups experience latency, disconnects or storage pressure | Deterministic small-group smoke/soak/capacity, bundle budgets and performance artifacts | Observe target deployment; publish supported operating envelope |
| AR-22 | Single-writer topology cannot meet future availability/scale | Medium / Residual | Write throughput/maintenance limits growth | Explicit SQLite single-writer topology, serialized writes, scoped worker, capacity checks; unused Postgres/Redis implication removed | Scale only from measured demand; do not preemptively build multi-region consistency |
| AR-23 | Browser-local or stale async work mutates the wrong campaign/session | High / Mitigated in code | Switching campaign/account applies a late response to current UI | Abort/session epoch guards, shared idempotency, retryable action state and workspace async tests | Monitor unusual slow-network paths |
| AR-24 | Proprietary-format imports imply unsupported compatibility | Medium / Accepted boundary | Users expect lossless import of data the product cannot legally or technically model | Published JSON/archive and provenance contracts; validation/repair preview; no scraping/copying promise | Add import adapters only with lawful specs and demand |

## Serious-risk play and release disposition

This supplemental matrix covers every Critical or High item without overloading the main register. “Blocks dependable real play” asks whether an open instance or failed mitigation prevents a representative group from relying on the affected path; “blocks public release” asks whether the risk must be mitigated, explicitly bounded, or externally evidenced before that advertised surface ships. A currently mitigated risk can therefore say “yes if reopened” without being represented as an open defect.

| ID | Affected user or operator | D&D/rules impact | Blocks dependable real play? | Blocks public release? |
| --- | --- | --- | --- | --- |
| AR-01 | Players, DMs and campaign owners | Direct: authoritative advancement, rest, damage, condition, attunement, effect or combat state can be wrong | **Yes if reopened**; currently mitigated by tested prepared transactions | **Yes if reopened** |
| AR-02 | Any concurrent player/DM editors | Direct: a correct newer rules or campaign value can be overwritten | **Yes if reopened**; shared play cannot be trusted | **Yes if reopened** |
| AR-03 | Campaign owners restoring or transferring campaigns | Direct: invalid actor/item/combat records can poison later calculations | **Yes for restore-dependent play**; current validation mitigation is local | **Yes if validation regresses**; hosted proof is addressed by AR-19 |
| AR-04 | Campaign owners and hosting operators performing recovery | Direct: rules records and referenced assets can disagree after partial restore | **Yes for recovery-dependent play** | **Yes until the target-host rollback drill passes** |
| AR-05 | Every user whose action was acknowledged | Direct: a correct transaction can disappear after restart | **Yes if reopened** | **Yes if reopened**; hosted telemetry remains required |
| AR-06 | Larger/long-running campaigns and operators | Indirect: latency or missed dirty state can delay or lose rules/campaign changes | **Conditional**: yes if a real campaign exceeds the proven persistence envelope; currently mitigated locally | **Conditional**: publish only the measured envelope and monitor it |
| AR-07 | Players/DMs receiving realtime state, especially users of private records | Direct: clients can act on stale state or receive hidden rules/campaign information | **Yes if reopened** | **Yes if reopened**; hosted network evidence still required |
| AR-08 | Owners exporting/importing asset-heavy campaigns | Indirect: rules state remains valid, but large-campaign portability/recovery can fail | **Conditional**: not for ordinary play; yes for near-limit recovery | **Conditional**: stream-path limit must be published and hosted near-limit evidence recorded |
| AR-09 | OIDC users and server administrators | No mechanical calculation impact; identity compromise exposes all authorized campaign/rules actions | **Conditional**: yes for an offered SSO path; password/local play is separate | **Yes before OIDC is offered publicly**; live IdP and independent review required |
| AR-10 | Server administrators and every campaign reachable by a worker | Direct if exploited: excess authority can mutate rules/campaign state | **Yes if scoped-worker controls fail** | **Yes if reopened**; deployment credentials also require rotation/monitoring |
| AR-11 | Hosted users and operators | Indirect: the service may accept traffic while unable to persist or deliver required assets | **Yes in the affected deployment** | **Yes until hosted readiness/storage/HTTPS evidence passes** |
| AR-12 | Any user whose token, signed URL or provider credential is logged | No direct rules-math impact; leaked authority exposes private state and mutations | **No for immediate mechanics**, but an observed leak requires incident containment | **Yes if secrets are exposed**; external pipeline transformations must be checked |
| AR-13 | Maintainers and, through regressions, all users | Indirect: a rule can be changed in one layer but omitted from another | **No while behavior suites and budgets pass** | **No by itself**; a behavior or enforced-budget regression blocks release |
| AR-14 | API/client/plugin consumers and affected players/DMs | Direct when consequential route schemas drift: valid rules actions can fail or invalid shapes can pass | **Yes for an affected core route if reopened** | **Yes if route inventory/runtime contract gates fail** |
| AR-15 | Campaigns whose administrator installs plugins; hosting operators | Direct if a plugin bypasses typed commands and mutates rules/storage | **No within the declared trusted-admin boundary while controls hold** | **No for that bounded product**; **yes** before claiming a hostile-code marketplace |
| AR-16 | Campaign managers using webhooks and operators of delivery infrastructure | No direct rules mutation by design; exposure is metadata/privacy/availability | **No for core play** | **No for core release**; the webhook surface needs hosted interoperability and monitoring before being advertised as production-ready |
| AR-17 | AI-using players/DMs and campaign owners | Indirect: generated guidance can misstate a rule; tool actions still pass current governance, permission and transaction controls | **No while the accepted controls hold** | **No as an accepted product boundary**; incident evidence may reopen it. Manual proposal and governed automatic modes remain unchanged |
| AR-18 | Content authors, players distinguishing official/homebrew/generated data, and release owners | Direct content-trust impact: correct mechanics may still have unclear or unlawful provenance | **No for lawful private user content** | **Yes for public content distribution until legal/release-owner approval** |
| AR-19 | Hosted campaign owners and operators upgrading or recovering | Direct preservation impact: actor/item/combat state and assets may not survive the actual topology | **No for a local session**, but **yes** for post-upgrade/recovery continuity | **Yes until hosted forward migration, non-no-op restore and rollback pass** |
| AR-20 | Keyboard, screen-reader and physical touch users | No rules-math impact; primary rules/session controls may be unreachable or unannounced | **Yes for affected users until manual evidence passes** | **Yes until the declared accessibility/browser/device matrix has no blocker** |
| AR-21 | Groups and operators on the target deployment | Indirect: latency, disconnects or storage pressure can interrupt actions and convergence | **Conditional**: yes if deployment measurements miss the supported envelope | **Yes until hosted capacity/observability evidence defines a supportable envelope** |
| AR-23 | Users switching campaign/account during slow requests | Direct: a valid result can be applied to the wrong campaign/session context | **Yes if reopened** | **Yes if reopened** |

## Risk-category assessment

### Rules-engine and character data

Rules state is still extensible JSON because D&D actors, items and homebrew need forward-compatible shapes. The mitigation is not to pretend JSON is safe: managed roots are version-validated; unknown fields are preserved; calculations are pure and sourced; consequential writes are prepared; and explicit manager overrides are reasoned/audited. This is narrower and more maintainable than a universal expression language.

Primary regression risk is adding a new class/spell/item feature in only one layer. The required path is static/content data or a pure resolver, a prepared API transaction if consequential, shared contract/client support, a session UI, and counterexample tests.

### Security and authorization

Server permission checks, not UI visibility, are authoritative. The comprehensive unauthenticated/observer/privileged route matrices, scoped workers, OIDC/SSRF controls, archive identity redaction, webhook boundaries, plugin grants and log redaction materially reduce the original risks. Live IdP, external review, provider configuration and operator secret handling remain outside local proof.

### Data integrity and migration

Exact revisions and idempotency address logical concurrency; the mutation coordinator and SQLite dirty/commit baseline address durability; snapshot history/realtime deltas address client convergence; archive staging/rollback addresses portability. These layers are complementary: a reconnect snapshot cannot repair a silently overwritten server value, and a valid archive cannot compensate for an untested hosted restore procedure.

Migration risk remains release-gated until the actual hosted topology completes forward/restore/rollback drills with assets and versioned fixtures. Local green tests establish capability, not operational competence.

### Realtime synchronization

The realtime protocol now provides monotonic sequence data, bounded history, permission filtering and delta/snapshot recovery. A client that observes a gap refreshes rather than guessing. Mutation responses and events carry exact authoritative revisions. Remaining uncertainty is network and hosted-scale behavior, not a missing reconciliation model.

### Performance

The main risks are the single-writer envelope, large composition roots, browser bundle/DOM size, and campaign assets. Dirty tracking removes per-flush full-state work; framed archives bound asset buffering; deferred panels/code splitting and architecture budgets constrain web growth; capacity/soak tests enforce a local small-group floor. Production limits must be published from measurements rather than inferred from local milliseconds.

### API and plugins

The public contract is `/api/v1` plus OpenAPI/API client. Runtime request validation is strict for JSON bodies while query/path coercion remains location-aware; non-AI responses are validated against declared status schemas. The executable route contract locks every non-AI mutation and requires shared-state preconditions plus retry identity or the route's explicit operator K/R/P/X model. Plugins remain a trusted-admin extension surface: typed commands pass through normal application permissions and persistence rather than writing storage directly. A hostile-code marketplace would require a different isolation/support commitment and is explicitly deferred.

### AI-specific risks

The existing agent can retrieve campaign/rules context and act through its configured governance mode. Risks include prompt injection in campaign text, hallucinated rules, context leakage, tool overreach, stale state, and misleading success claims. Existing citations/untrusted labels, scoped context, provider/privacy controls, permissioned tools, transaction confirmation, audit and result-grounded responses are the current controls.

The accepted product decision is to retain both manual proposal review and governed automatic execution. This register does not recommend making AI optional, disabling it, or forcing all work through proposals. Any future change to agent behavior requires a direct AI product task and its own threat/UX review.

### Self-hosting

The supported architecture is explicit: a single-writer API with SQLite state and configured asset storage, plus optional scoped auxiliary services. Readiness fails closed when production-critical configuration is absent. Operators still own TLS, secret rotation, backups, storage durability, monitoring and upgrade drills; the docs must not imply the project can validate those remotely.

## Risk interactions

- AR-01 + AR-02: correct calculations still fail users if stale shared state can overwrite the commit; prepared revisions address both.
- AR-03 + AR-04 + AR-08: a portable archive must be semantically valid, atomic across state/assets, and memory-bounded; solving only one is insufficient.
- AR-07 + AR-23: realtime sequence recovery and UI session guards jointly prevent late/duplicate/wrong-campaign application.
- AR-09 + AR-12: endpoint validation is weakened if tokens or redirect URLs later leak through logs.
- AR-13 + AR-14: decomposing routes without contract enforcement can move drift rather than remove it; architecture budgets and runtime schemas must remain paired.
- AR-19 + AR-21 + AR-22: local correctness does not choose a future scale architecture; hosted evidence should trigger any topology change.

## Accepted boundaries for the next stage

- SQLite single-writer remains acceptable for internal/private-alpha evidence while serialized durability and the declared local capacity floor hold.
- Geometry-dependent combat and arbitrary natural-language rules remain advisory/manual rather than guessed.
- Plugins remain trusted-admin extensions, not hostile marketplace code.
- Legacy JSON/base64 archives remain capped for compatibility; framed streams are the large-campaign path.
- AI manual and governed-auto modes remain unchanged and supported.
- Proprietary D&D content remains outside the shipped repository unless independently licensed and supplied.

## Mitigation and evidence sequence

1. Keep the now-green consolidated local test/build/security/migration/deployment/performance/docs/browser matrix green.
2. Record internal repeated-session outcomes and turn every code defect into a regression.
3. Run live IdP and hosted HTTPS/storage/recovery/migration/rollback exercises.
4. Complete manual assistive-technology, cross-browser and physical-device checks.
5. Obtain independent security and content/legal release review.
6. Publish the measured support, compatibility and operating envelope before public beta.

No new broad feature or architecture initiative outranks these evidence steps unless it fixes a defect found by them.

## Architecture budget snapshot

<!-- ARCHITECTURE_BUDGET -->
The closing composition-root budgets are green:

- `apps/api/src/app.ts`: **25,126** physical lines against the enforced **38,500** ceiling. Identity, SCIM, asset administration, campaign sessions, webhooks, scene delegation, archive, asset operations, and D&D inventory contracts remain behind focused modules/registrars.
- `apps/web/src/App.tsx`: **11,217** physical lines against the enforced **11,250** ceiling. Extracted panels, typed operator clients, campaign setup, audio, actor-action, and shared workspace concerns remain outside the shell.
- `packages/system-sdk/src/index.ts`: **17,999** physical lines against the enforced **18,000** ceiling, with static content and focused D&D mechanics behind dependency-checked modules.
- The final focused API architecture/read/mutation run passed **3 files / 14 tests**; the web architecture suite is included in the green **92-file / 458-test** web run, and the system-SDK module-boundary suite passed **3/3**.

These ceilings are regression budgets, not a mandate for speculative rewrites. Future extraction should follow coherent transaction or domain seams found by real changes.
<!-- /ARCHITECTURE_BUDGET -->
