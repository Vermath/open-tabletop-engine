# Architecture Risks

## 2026-07-17 remediation disposition (authoritative)

This disposition supersedes conflicting 2026-07-16 open-risk labels. It covers the current uncommitted tree and distinguishes code mitigation from independent operational proof.

### Current architecture verdict

The existing single-authoritative-writer architecture held up under remediation; no rewrite was needed. The repaired seams now consistently use typed commands/projections, explicit permissions, revisions/idempotency, bounded external waits, ordered recovery, and versioned persistence. The dominant remaining risks are empirical release risks, not missing architecture.

| Risk | Current disposition |
|---|---|
| AR-34 critical continuation | Mitigated in code and focused/browser regression coverage. |
| AR-35 life-state projection | Mitigated with bidirectional actor/combatant synchronization and recovery coverage. |
| AR-36 group movement | Mitigated with one permission-preflighted transactional batch command. |
| AR-37 AI mutation lock | Mitigated with short durable phases around the provider stream; automatic execution remains intact. |
| AR-38 / AR-48 deployment and paired recovery | Code/configuration mitigated; X03 independent hosted restore remains the acceptance gate. |
| AR-39 / AR-40 browser session and authentication abuse | Mitigated with hardened cookie/CSP/revocation and proxy/account-aware bounded verification controls; X07 remains. |
| AR-41 release nondeterminism | **Mitigated locally on the exact tree.** Gate lifecycle/diagnostics, per-run E2E storage, stale browser semantics, and backup/drill action serialization are repaired; the full repository gate plus aggregate 62/62, bootstrap 1/1, canonical 1/1, and full combat 1/1 are green. Repeat this candidate discipline for every handoff. |
| AR-42 AI/agent contract and sequence parity | Mitigated on the selected public surfaces with schema, revision/idempotency, sequence, and gap recovery. |
| AR-43 character/spell attribution | Mitigated with typed grant sources and SRD class/multiclass fixtures. |
| AR-45 outbound scanner SSRF | Mitigated by the shared outbound target and redirect policy. |
| AR-47 supply-chain drift | Mitigated through pinned images, broader dependency automation, and SBOM policy checks. |
| AR-49 workflow/accessibility state loss | Code mitigations cover keyboard board operations, drafts, paging/search, and responsive flows; X04 physical evidence remains. |
| AR-44 composition-root size | Residual/monitored. Growth budgets and seam extraction remain appropriate; it is not a release blocker by itself. |
| AR-46 plugin isolation | Accepted trusted-administrator boundary. A hostile-code marketplace claim remains prohibited. |

The AR-41 result is a current candidate qualification, not permanent proof. Any source change invalidates the content-addressed local evidence it affects; hosted CI and the external X-gates remain independent checks.

### Remaining stage gates

- **Private alpha:** X01 repeated real-table sessions and X03 independent hosted paired restore; X02 only for advertised enterprise identity.
- **Public beta:** X04-X08, including physical accessibility, hosted operations, content/legal approval, independent security, and AI/provider evaluation when offered.
- **Continuous:** composition-root budgets, permission/contract matrices, archive compatibility, and the rule that external waits never occupy durable mutation critical sections.

## 2026-07-16 architecture-risk addendum (authoritative)

This register supersedes the "no hidden implementation backlog" conclusion below. It covers committed HEAD `9de6a3c` plus the current uncommitted tree and distinguishes a solid architectural foundation from unresolved release risks.

### Architecture verdict

The repository's core shape is worth preserving: explicit server authorization, typed domain commands, SQLite transactions, durable-flush rollback, revision/idempotency guards, bounded checksummed archives, asset path confinement, content provenance, and grounded/permission-checked AI execution are strong. The primary risks come from **inconsistent use of those strengths at cross-root seams**: attack-to-damage continuations, actor-to-combat projection, browser-to-server batch mutations, long-lived AI requests, and deployment configuration.

A rewrite would add risk. Use narrow typed transitions, shorter critical sections, contract parity, and incremental extraction from composition roots.

### Current prioritized risk register

| ID | Severity | Risk and evidence | Failure mode | Required mitigation | Stage gate |
|---|---|---|---|---|---|
| AR-34 | Critical | Critical outcome is absent from the attack-damage continuation; the existing critical-formula helper is unused | Rules-visible attacks commit ordinary damage on critical hits, including expanded-range cases | Typed critical verdict/threshold in resolver and continuation; server-side dice transformation; commit/replay/undo matrix | Blocks Foundation exit and every later stage |
| AR-35 | High | Actor healing normalizes actor state, but combat sync only sets `defeated=true` and never clears combatant defeat/death saves | Sheet and initiative hold contradictory life state | One transactional actor-to-combatant projection with bidirectional tests and reconnect/undo coverage | Blocks Foundation/internal deterministic exit and every later stage |
| AR-36 | High | Group token drag issues independent requests after no complete client/server permission preflight | Mixed-authority selection partially commits before rejection | Typed batch move, preflight every token, one transaction/event/undo, coherent realtime payload | Blocks Foundation/internal deterministic exit and every later stage |
| AR-37 | High | Global durable mutation coordinator wraps all non-GET requests; AI thread POST can await a provider stream with a minutes-long timeout | One slow AI request stalls unrelated campaign mutations | Split AI flow into short durable phases around the external stream; preserve automatic permission-checked commands; concurrency test | Blocks AI-enabled alpha |
| AR-38 | High | Compose defaults to HTTP MinIO while production runtime rejects non-HTTPS storage; signing-secret example is disabled; scheduler variables are not passed through | Documented boot fails or backup status is falsely reassuring | Explicit local storage profile without weakening remote policy; coherent secret bootstrap; scheduler env/health; paired restore proof | Blocks self-host alpha |
| AR-39 | High | Browser stores a long-lived bearer token in localStorage and static hosting has no CSP | XSS yields reusable session material and broad account/campaign impact | Migrate to hardened cookie/session transport with revocation/compatibility; ship CSP; audit script/style/plugin surfaces | Blocks public beta |
| AR-40 | High | Login throttle keys request IP without verified proxy trust or account dimension; password verification is synchronous | Proxy deployments collapse users into one key or permit distributed account attack; CPU work amplifies abuse | Explicit trusted-proxy configuration, account+network controls, bounded async verification, security telemetry | Blocks public beta |
| AR-41 | High | Canonical journey failed then passed; aggregate API tests produced late timeouts and worker RPC errors and did not reach the final build | Release gate can bless or reject the same code nondeterministically; regressions become unactionable | Eliminate continuation race; isolate test resources; bound startup/teardown; retain diagnostics; require repeated cold passes | Blocks release qualification |
| AR-42 | High | AI/agent routes are exempt from OpenAPI runtime validation and revision guards; events lack campaign sequencing | Contract drift and reconnect gaps create stale or duplicated AI/agent state | Bring stable AI/agent surfaces under schemas, revision/idempotency, and sequence/gap recovery; document deliberate streaming exceptions | Blocks public beta; selected paths before alpha |
| AR-43 | High | Advancement spell validation is narrow and spellcasting ability can fall back to primary class | Multiclass and non-Cleric/Wizard spell state becomes semantically wrong while appearing valid | Typed grant source/acquisition/ability metadata and class-complete validation fixtures | Blocks broad rules alpha |
| AR-44 | Medium | Composition roots are very large: `apps/api/src/app.ts` ~25.6k lines, System SDK index ~18k, API contracts index ~16.3k, web `App.tsx` ~11.2k | Small changes create broad conflict/regression radius and discourage clear ownership | Extract only around proven seams: continuations, life-state projection, batch commands, test fixtures, deployment config; enforce budgets on new growth | Manage continuously; no rewrite gate |
| AR-45 | Medium | External asset scanning has weaker outbound URL policy than campaign webhooks | Scanner becomes an SSRF path into local/metadata networks | Reuse one outbound-target validator and redirect policy; test DNS rebinding/private ranges/redirects | Before untrusted asset ingestion |
| AR-46 | Medium | Plugin VM is suitable for trusted administrator extensions, not hostile marketplace code | A "sandboxed plugin" claim creates false isolation expectations | Label trust boundary; keep typed permission-checked commands; defer hostile marketplace until OS/process isolation exists | Product claim gate |
| AR-47 | Medium | Dependency automation covers actions more than application packages and Compose uses an unpinned MinIO `latest` image | Upstream drift changes production behavior without intentional release review | Pin images by version/digest, expand dependency update policy, produce SBOM/advisory evidence | Before public beta |
| AR-48 | High | Backup scheduler covers database operations more clearly than paired asset lifecycle | Restore can produce a logically incomplete campaign | Manifest database/assets together, checksum, retention as a unit, and rehearse clean-environment restore | Blocks self-host alpha |
| AR-49 | Medium | Main board remains pointer-first; modal/list surfaces hide or lose draft/overflow state | Keyboard and small-screen users cannot complete core workflows, and users mistake hidden state for data loss | Keyboard command model for movement/tools; responsive task tests; explicit draft recovery and paging | Blocks public beta |

### Evidence anchors for the current register

| Risk | Code, configuration, or runtime evidence |
|---|---|
| AR-34 | `packages/system-sdk/src/dnd-action-continuations.ts:46-64`; unused `dnd-rules-completion.ts:304-315`; critical-range metadata `packages/system-sdk/src/index.ts:2241-2242`. |
| AR-35 | Actor recovery `packages/system-sdk/src/index.ts:12029-12037`; mutation `apps/api/src/app.ts:10621-10665`; one-way `syncCombatDefeatedFromActorIds` at `:22501-22511`. |
| AR-36 | `apps/web/src/scene-canvas.tsx:731`; independent group requests in `apps/web/src/App.tsx:4411`. |
| AR-37 | Coordinator `apps/api/src/app.ts:844-874,1037`; non-GET hook `:17904-17933,18045-18047`; streamed AI route `:7467-7553`; provider timeout `packages/codex-app-server-provider/src/index.ts:251-255`. |
| AR-38 / AR-48 | `docker-compose.yml:23-33,62-67`; `.env.example:87-88`; `apps/api/src/runtime.ts:142-155`; scheduler/backup code `apps/api/src/asset-operations.ts:1819-1858`. |
| AR-39 | `apps/web/src/api.ts:5-32,248-249`; session default `apps/api/src/app.ts:20326-20328`; existing cookie parser `apps/api/src/session-transport-auth.ts:24-41,73-87`; `apps/web/src/static-runtime.ts:128-150`; `infra/docker/nginx.conf:1-11`. |
| AR-40 | Generic limit `apps/api/src/app.ts:787-788,17645-17648`; request-IP key `:17657-17665`; synchronous password work `:21485-21495`; failed-login audit `:1514-1559,21449-21450`. |
| AR-41 | Fresh canonical failure at `tests/e2e/canonical-public-journey.spec.ts:413`, then immediate pass; forced `pnpm check` reached 27 API failures and 4 worker RPC errors after lint/typecheck passed. |
| AR-42 | `apps/api/src/openapi-runtime-validation.ts:38-53,82-98,265-266`; revision exception `apps/api/src/app.ts:17710-17717`; unsequenced events `:1211-1219`; `apps/web/src/realtime-sequence.ts:31-40`; `realtime-refresh.ts:70-77`. |
| AR-43 | `packages/system-sdk/src/dnd-validation-preview.ts:927-946`; `apps/web/src/advancement-flow.tsx:370-374,694-695`; spell fallback `packages/system-sdk/src/index.ts:2256-2290,2575-2585`. |
| AR-44 | Current measured roots: `apps/api/src/app.ts` about 25.6k lines; `packages/system-sdk/src/index.ts` about 18k; `packages/api-contracts/src/index.ts` about 16.3k; `apps/web/src/App.tsx` about 11.2k. |
| AR-45 | External scanner policy in `apps/api/src/asset-operations.ts` is weaker than the outbound-target/redirect restrictions used by campaign webhook routes in `apps/api/src/app.ts`. |
| AR-46 | Plugin runtime/VM and capability APIs under `packages/plugin-sdk` and API plugin routes are permission-checked but operate inside the trusted host boundary. |
| AR-47 | `.github/dependabot.yml` covers actions more narrowly than application dependencies; `docker-compose.yml` uses an unpinned MinIO `latest` image. |
| AR-49 | Creator dismissal `apps/web/src/character-creator-dialog.tsx:625,632`; sheet caps `actor-panel.tsx:602,619,628,669`; invite cap `App.tsx:9503`; pointer-first scene canvas/tooling. |

### Current-to-historical risk crosswalk

The current register controls when a historical entry below uses a different severity or says "mitigated."

| Current risk | Historical counterpart | Reconciliation |
|---|---|---|
| AR-41 High/open | AR-11 Medium/mitigated | Fresh aggregate and canonical failures reopen the risk at High; old green evidence is no longer current. |
| AR-44 Medium/monitor | AR-07 High | Budgets/extractions reduce immediate release impact, but the large roots remain; current disposition is incremental extraction, not "resolved." |
| AR-46 Medium/accepted boundary | AR-08 Critical | Trusted-admin plugins are acceptable and explicitly scoped. It becomes Critical only if hostile marketplace isolation is claimed. |
| AR-48 High/open | AR-06 Critical | Paired asset restore remains a private-alpha blocker. Current High reflects a recoverability gap rather than observed destructive loss; the mitigation and gate remain mandatory. |
| AR-34 through AR-43 and AR-45/47/49 | No exact historical equivalent or materially changed evidence | Use the current severity, evidence, and stage gate. |


### Serious-issue user and release disposition

The risk table above contains the technical impact, evidence, and mitigation. This table makes user/rules impact and disposition explicit.

| ID | Affected user and user impact | Rules impact | Blocks real play? | Blocks public release? | Disposition |
|---|---|---|---|---|---|
| AR-34 | Every player/DM resolving an attack can see a critical deal ordinary damage | Direct, definitely incorrect | Yes | Yes | Fix immediately |
| AR-35 | A healed player and DM can see opposite answers about whether the character may act | Direct, definitely incorrect state projection | Yes | Yes | Fix immediately |
| AR-36 | DMs/players moving mixed-owned groups can partially alter the board after an error | Indirect; table position/authority, not a RAW ruling | Yes for collaborative play | Yes | Fix immediately |
| AR-37 | All users can be unable to save/move/act while one AI provider call waits | Rules commands are delayed but not reinterpreted | Yes when AI is enabled | Yes if AI is offered | Fix before AI-enabled alpha; otherwise disable AI in that profile |
| AR-38 | Self-host operators and their groups may not boot or may trust incomplete backups | None directly | Yes for the documented install | Yes for advertised self-hosting | May begin during M0; required and independently proven for M3 exit |
| AR-39 | Account/campaign owners face amplified session theft after XSS | None directly | Not for trusted local play | Yes | Fix before public beta |
| AR-40 | Users behind proxies can be unfairly throttled while targeted accounts remain attackable | None directly | No for small trusted play | Yes | Fix before public beta |
| AR-41 | Maintainers cannot distinguish a release regression from timing/worker failure; users inherit missed defects | Can hide rules regressions | Yes as a release-confidence gate | Yes | Fix immediately |
| AR-42 | AI users can reconnect to stale/duplicated thread or command state | May duplicate or omit authoritative rules operations | Selected AI paths | Yes if AI is offered | Schedule before AI alpha/public beta |
| AR-43 | Non-Cleric/Wizard and multiclass spellcasters can receive illegal choices or wrong save/attack ability | Direct, likely/definitely incorrect by case | Yes for affected characters | Yes | Fix before broad rules alpha |
| AR-44 | Maintainers face high regression/conflict cost and slow review | Indirect through rule-change blast radius | No | No by itself | Monitor budgets; extract only touched seams |
| AR-45 | Operators may expose internal/metadata services through untrusted asset URLs | None directly | No for trusted assets | Yes | Fix before untrusted ingestion |
| AR-46 | Operators may assume hostile plugins are isolated when they are not | None directly | No under trusted-admin use | Blocks a hostile-marketplace claim | Accept and document boundary; defer marketplace |
| AR-47 | Operators can receive unreviewed image/package behavior changes | None directly | No | Yes at public scale | Schedule pinning/SBOM policy before beta |
| AR-48 | Entire groups can restore a campaign without required assets | None directly; maps/handouts become unusable | Yes for recovery | Yes for self-hosting | Fix and drill before private alpha |
| AR-49 | Keyboard, assistive-tech, tablet, and small-screen users cannot complete core board tasks | None directly | Yes for affected users | Yes | Schedule and independently verify before beta |


### Cross-cutting mitigation rules

1. **One domain transition, one authority.** Attack/damage, actor/combatant state, and group movement must be represented as typed commands or projections, not coordinated by independent browser calls.
2. **External waits are never durable critical sections.** Provider streams, scanners, and webhook calls occur between short authorized persistence phases.
3. **Every mutation surface gets the same contract spine.** Schema validation, authorization, revision/idempotency, ordered event/reconnect behavior, audit, and undo are default requirements; exceptions must be explicit and tested.
4. **Persistence evidence includes recovery.** A successful write is insufficient without archive compatibility, paired assets, migration behavior, and clean restore.
5. **Release gates must be repeatable.** One passing E2E run is not evidence when an immediate neighboring run fails.
6. **Trust boundaries must match product language.** Trusted-admin plugins and manual-adjudication spell paths are valid; calling them hostile sandboxes or full automation is not.
7. **Extract around change pressure.** Move narrow pure helpers and typed modules out of composition roots as tickets touch them; do not launch a horizontal rewrite.

### Release-stage architecture gates

| Stage | Must close | Evidence |
|---|---|---|
| Internal deterministic build | AR-34, AR-35, AR-36, AR-41 | Focused matrices, two-client transaction test, 10/10 canonical journey, two cold aggregate passes |
| AI-enabled internal build | AR-37 plus relevant AR-42 paths | Delayed-provider concurrency, cancellation/idempotency, sequenced reconnect |
| Private self-host alpha | AR-38, AR-43, AR-48; operational portions of AR-42 | Independent install, class fixtures, upgrade and clean restore drill |
| Public beta | AR-39, AR-40, AR-45, AR-47, AR-49 and remaining AR-42 | Security/accessibility review, pinned supply chain, hostile-network tests, hosted recovery evidence |

### Accepted and deferred risks

- Manual adjudication for complex persistent spells is acceptable through private alpha when the UI and documentation identify it.
- Large composition roots are accepted temporarily if new work does not add untyped cross-root coordination.
- Trusted-admin plugin execution is acceptable if the product does not market it as a hostile-code sandbox.
- High availability, multi-region operation, universal rules scripting, and a third-party marketplace are deferred; none should be used to postpone the current state-integrity work.


> **Historical register below is retained for traceability only.** Current AR-34 through AR-49 severity, evidence, mitigation, and stage gates control; any older "mitigated," "complete," or conflicting severity label is superseded.

> Re-issued 2026-07-15 at committed HEAD `b5e30f1`, clean tree. T01–T37 are committed; this session independently re-verified the mitigations it probed and re-ran the aggregate/canonical gates fresh (results in `FEATURE_AUDIT.md`). "Mitigated locally" never implies hosted proof, real-session evidence, or independent review; X01–X08 remain open. Two new risks (AR-32, AR-33) were added from this session's findings.

## Architecture verdict

The architecture remains correct for its declared product: a single-node, small-group D&D 5.5e VTT. Fastify is the one authoritative writer; SQLite persists campaign state; the API owns permissions/revisions/idempotency/rules transactions; React consumes typed contracts; realtime distributes permission-filtered authoritative changes. Live payload inspection this session confirmed the model is real, not aspirational: resolutions arrive with before/after actor updates, audit events, undo envelopes with expected revisions, and fairness metadata.

The dominant risks are no longer missing code paths. They are: regression concentration in very large composition roots, evidence/process hygiene in a fast-moving solo workflow (measured live this session — see AR-32), the accepted single-process topology, and everything gated on external evidence (hosted recovery, physical accessibility, provider behavior, content rights, independent security, AI quality). The correct response remains measured evidence and narrow seams — not microservices, not a rules DSL.

## Dispositions

| Disposition | Meaning |
| --- | --- |
| Mitigated locally | Code + focused regressions + fresh local acceptance exist; hosted/external regression remains possible |
| Residual/monitored | A bounded ongoing risk remains |
| Accepted boundary | Deliberate for the declared product/topology |
| Evidence-gated | Only deployments, devices, users, or independent reviewers can close it |

## Ranked risk register

| ID | Risk | Severity / disposition | Current control | Remaining action/gate |
| --- | --- | --- | --- | --- |
| AR-01 | Authoritative D&D result can look successful while wrong | Critical / Mitigated locally — **one live counterexample found and ticketed** | T01–T04, T21–T24, T27–T30 counterexamples retained; fresh aggregate+canonical green; this session still found R-04 (Second Wind economy) live | Land T38/T39; keep reopening on any reproducible counterexample |
| AR-33 **(new)** | Feature rolls without activation metadata silently default to consuming the standard Action | High / Open (ticketed) | Classifier is conservative by design (`dnd-action-economy.ts:9`); spells and Rage carry correct metadata | T38 fixes Second Wind; T39 adds a sweep test so a new metadata-less roll fails CI |
| AR-32 **(new)** | Release/audit claims can drift from repository reality (unreproducible evidence; gate-pin breaks) | High / Partially mitigated — **measured live** | CI runs `release:smoke` on push; guard pins make drift loud (the `63d5950` break failed exactly one pinned assertion and was repaired in 16 min) | T40 persisted evidence artifacts; T41 fast local gate; never cite runs without artifacts |
| AR-02 | Combat stale recovery retries an unsafe advance | High / Mitigated locally | One retry only when round/turn/combatant-count unchanged | Canonical concurrent coverage + X01 real conflicts |
| AR-03 | Flexible JSON permits inconsistent managed domain state | High / Mitigated locally; residual | T17 typed managed views validate touched API/archive seams; unknown fields preserved | Continue incremental managed-root validation |
| AR-04 | Single-process realtime/rate-limit/SQLite topology | Medium / Accepted boundary | One authoritative process; permission-filtered snapshots/events | Publish the envelope; X05 measurements before any redesign |
| AR-05 | Session token transport leaks via URL compatibility | High / Mitigated locally; residual | Header/cookie/subprotocol-first; env-gated URL-token mode; redaction; revocation | Remove compatibility after the published window; X05/X07 proxy/log inspection |
| AR-06 | Backup/restore can omit or mismatch assets | Critical / Evidence-gated | T15 coordinated manifests/schedules/recovery UI/runbooks | X03 provider-native non-no-op drill |
| AR-07 | Large composition roots/bundles raise regression cost | High / Residual/monitored | Lazy boundaries; enforced size budgets (fresh numbers below) | Extract only when a changed domain justifies it |
| AR-08 | Plugin VM is not an OS security boundary | Critical / Accepted trusted-admin boundary | Signed/trusted/approved capabilities; typed permission-checked commands | No hostile-marketplace claim; X07 |
| AR-09 | AI prompt injection, context leakage, misleading action | High / Residual/evidence-gated | Policy, scope/permission intersection, context filtering, citations, audit, transaction revalidation; both modes preserved | X07 adversarial + X08 quality/provider evaluation |
| AR-10 | Content provenance/attribution lacks independent approval | High / Evidence-gated | SRD 5.2.1 + CC BY 4.0 attribution embedded per served entry (verified live) | X06 inventory/approval |
| AR-11 | Aggregate validation is resource-sensitive or stale | Medium / Mitigated locally — **re-proven this session** | `maxWorkers: 2` committed with rationale; single-fork perf project; fresh forced run green (1,842 tests); cold-start timeouts bumped in `b5e30f1` | Keep fresh-evidence gating (T40); rerun on candidates |
| AR-12 | Accessibility/device compatibility is automation-only | High / Evidence-gated | Keyboard/DOM/responsive tests; structured accessible review dialogs with focus management (asserted in canonical spec) | X04 physical matrix |
| AR-13 | Audit/operational histories grow without control | Medium / Mitigated locally | T16 permissioned preview/apply retention with metrics | X05 production thresholds |
| AR-14 | Shared writes/auth/privacy regress on a new route | Critical / Residual/monitored | Explicit permissions, exact revisions, idempotency, route matrix, filtered events/snapshots; both app.test.ts coverage gates trip on new routes | Keep release-gating; X07 |
| AR-15 | Runtime/OpenAPI/client contracts drift | High / Residual/monitored | Runtime validation; typed contracts; route/client coverage tests | Version discipline; aggregate gates |
| AR-16 | Hosted migration/rollback differs from local fixtures | Critical / Evidence-gated | Identity-bound rollback, checksums, journaling, recovery tests | X03 |
| AR-17 | Campaign permissions lacked an operable member UI | Medium / Mitigated locally | T10 People panel with owner/self/SCIM guards | X01 multi-DM usability |
| AR-18 | Gridless domain support differed from browser behavior | Low / Mitigated locally | T11 modes, suppression, persistence, unsnapped movement | X01/X04 |
| AR-19 | Death-save lifecycle could diverge from actor/combat state | High / Mitigated locally — **verified live** | Atomic resolution observed (nat-20 revive: counters reset, lifeState, undo envelope) | X01 real combat |
| AR-20 | Heroic Inspiration disconnected from player loop | Medium / Mitigated locally — **verified live** | Grant/overflow-transfer/reroll observed | X01 player use |
| AR-21–AR-28, AR-31 | Class-level semantics, monster rolls, action ledger, overrides, archive identity, encounter placement, capability/browser drift, AC intent, controlled creatures | High→Critical / Mitigated locally | Committed with counterexamples (spot re-verified; ledger in `DND_RULES_AUDIT.md`) | Retain regressions; X01/X03 as noted |
| AR-29 | System-SDK entrypoint exceeds its boundary | Medium / Mitigated locally | 17,982 lines under the 18,000 gate (measured fresh) | Don't raise the ceiling to hide growth |
| AR-30 | Roll replay mistaken for trustless fairness | Medium / Accepted trusted-host boundary | One deterministic replay path; no-precommit boundary stated in code/contract/UI | No commit-before-roll claims without a witnessed protocol |

## What changed in this revision

- **AR-32 added (evidence/process risk), with two live measurements:** (a) commit `63d5950` (22:15) changed the root `security:audit` script; the pinned guard in `deployment-smoke.test.ts` failed this audit's first forced root run; the identical one-line repair this audit applied was committed as `b5e30f1` (22:31). (b) GitHub Release Smoke was red on main for the three pushes preceding this audit (`e4c6ac9`/`f64c6f2` failed the old `pnpm audit` step in ~50s; `63d5950` failed the guard pin at 8m50s), while local prose claimed triple-green — local evidence and hosted CI drifted for at least a day. The gate design worked (drift was loud and precise); the loop between local claims and CI verdicts is the gap. T40/T41 close it.
- **AR-33 added (classification-default risk):** the R-04/R-05 mechanism. One sweep test (T39) converts this from a recurring class of silent defect into a CI failure.
- **AR-01/AR-11/AR-19/AR-20 annotated** with this session's live verification.
- Prior ledger's frozen-run evidence replaced by this session's fresh, reproducible record (see `FEATURE_AUDIT.md`).

## Risk-category assessment

### Rules engine and character data
Prepared typed commands + pure resolvers remain the right narrow architecture; R-04 was a one-field data gap, not a design flaw, and its fix is a one-line metadata addition plus a regression. Multiclass hit dice now use per-class pools (`index.ts:3563`), removing a known drift source. The web still derives some presentation capability data locally (`actor-sheet-data.ts` re-implements two `dnd5eSrd*` presentation heuristics); server revalidation and sheet/API agreement tests remain essential.

### Security and authorization
Hashed sessions, explicit permissions, expiring grants, exact revisions, idempotency, redaction, permission-filtered snapshots/events; header-first transport with an env-gated URL-token compatibility window. Live player-seat inspection confirmed filtering reaches the UI (hidden adversaries, redacted vitals). Residuals: proxy/log transforms, lockout behavior under load, trusted-plugin execution, adversarial AI — X05/X07.

### Data integrity, migration and ownership
SQLite transactions, dirty tracking, checksummed archives, bounded streaming, identity-bound rollback, resumable operations. The canonical journey's mid-session API restart-and-resume passed fresh this session — the strongest local integrity proof available. X03 remains Critical evidence for hosted parity.

### Realtime synchronization
Session/org/campaign access rechecked on join and outbound state; gaps recover via permission-filtered snapshots. One-process contract; multi-replica ordering out of scope.

### Performance and maintainability
Fresh measurements: main production JS 800.87 kB (211.85 kB gzip), deferred dice runtime 557.37 kB (147.01 kB gzip), CSS 233.71 kB (41.48 kB gzip) — matching the prior ledger. Composition roots (below) remain the concentration risk; budgets hold.

| Root/artifact | Fresh measurement | Budget/finding |
| --- | --- | --- |
| `apps/api/src/app.ts` | 25,499 lines | High route-composition blast radius |
| `packages/system-sdk/src/index.ts` | 17,982 lines | Under the 18,000 gate |
| `packages/api-contracts/src/index.ts` | 16,302 lines | Contract concentration |
| `apps/web/src/App.tsx` | 11,192 lines | Under the 11,250 gate |
| `apps/api/src/app.test.ts` | 40,388 lines | Aggregate-suite worker/memory risk (bounded by `maxWorkers: 2`) |

Line counts are guardrails, not goals. Lower budgets only after stable extraction; never raise them to green a red gate.

### API and plugins
339 route handlers with dual coverage gates (auth matrix + MCP classification) that force every new route through security review. Broad surface raises compatibility cost; version discipline required. Plugins stay trusted-admin.

### AI-specific
Provider abstraction (Codex App Server), policy env (`OTTE_AI_*`: scopes, retention, transmission disclosure), admin sweeps/retry/evaluations, both execution modes under policy. X07/X08 decide public claims.

### Self-hosting and operations
Recipes, containers, retention, observability, CI release gate on push/PR. Operators own TLS, secrets, provider durability, schedules, upgrades, drills. X03/X05 prove the selected topology.

## Recommended next sequence

1. Land T38/T39 (rules seam) and T40/T41 (evidence loop).
2. Exercise X01 repeated real-table sessions.
3. X02 provider evidence if advertised; X03 hosted recovery + X05 operating drills.
4. X04 physical accessibility matrix.
5. X06/X07/X08 before public beta.
6. Revisit topology only if measured evidence violates the single-node boundary.

## Accepted boundaries

- SQLite single-writer, process-local realtime for the small-group scope.
- Reviewed manual geometry (cover, pathing, terrain, line of effect, Push).
- Explicit manual/unsupported prose rather than guessed automation; legendary actions currently in this class (T42 proposes a scheduled economy without auto-resolution).
- Trusted-admin plugins.
- Bounded streamed archives with published limits.
- Both AI modes behind current controls.
- No proprietary non-SRD distribution without independent rights.
