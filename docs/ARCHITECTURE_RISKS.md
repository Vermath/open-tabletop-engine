# Architecture Risks

> Current-state register, 2026-07-16. The baseline is HEAD `e4c6ac9` plus the validated implementation working tree. T01-T37 are implemented across those states, and the frozen local aggregate/canonical acceptance gates passed. "Mitigated locally" does not imply hosted proof, real-session evidence or independent review. X01-X08 remain open. AI manual and governed automatic execution are both preserved.

## Architecture verdict

The architecture remains coherent for a single-node, small-group D&D VTT: Fastify is the authoritative writer, SQLite persists campaign state, the API owns permissions/rules transactions, React consumes typed contracts and realtime distributes permission-filtered authoritative changes.

The audit's concrete successful-looking-wrong-state defects now have narrow implementations: class levels, exact monster bonuses, Action economy, calculation overrides, Death Saves, save Advantage, Mastery, Rage, Armor Class intent, archive target identity and encounter placement. Browser/API drift in people management, gridless scenes, duplication, streaming and search is also closed in the working tree. Typed managed D&D subroots reduce raw-data risk without discarding unknown legacy/homebrew content.

The dominant current risks are no longer known missing code paths or an unrun local acceptance gate. They are regression risk in concentrated roots, the accepted single-process topology, hosted state-plus-asset recovery, physical accessibility, provider/operational behavior, content rights, independent security and AI-quality evidence. The right response is measured external evidence, not microservices or a universal rules DSL.

## Dispositions

| Disposition | Meaning |
| --- | --- |
| Mitigated locally | Code, focused regression controls and applicable frozen-tree local acceptance exist; hosted/external regression remains possible |
| Residual/monitored | A bounded ongoing architecture risk remains |
| Accepted boundary | Deliberate for the declared product/topology |
| Evidence-gated | Only deployed infrastructure, devices, users or independent reviewers can close it |

## Ranked risk register

| ID | Risk | Severity / current disposition | Current control | Remaining action/gate |
| --- | --- | --- | --- | --- |
| AR-01 | Authoritative D&D result can look successful while wrong | Critical / Mitigated locally | T01-T04, T21-T24 and T27-T30 retain concrete counterexamples across typed SDK/API/UI paths; repeated aggregate and canonical gates passed | Retain release gates; reopen on any reproducible counterexample |
| AR-02 | Combat stale recovery retries an unsafe advance | High / Mitigated locally | One retry only when round, turn and combatant count remain unchanged; otherwise explicit review | Keep canonical concurrent-combat coverage and X01 real-table conflicts |
| AR-03 | Flexible JSON permits inconsistent managed domain state | High / Mitigated locally; residual | T17 versioned typed managed actor/item views validate API/archive seams | Continue incremental managed-root validation; preserve unknown legacy/homebrew data |
| AR-04 | Single-process realtime/rate-limit/SQLite topology | Medium / Accepted boundary | One authoritative process, permission-filtered snapshots/events, bounded local concurrency | Publish the single-node envelope; use X05 measurements before redesigning |
| AR-05 | Session token transport leaks through URL compatibility | High / Mitigated locally; residual | T14 header/subprotocol-first transport, redaction, revocation and bounded compatibility path | Remove compatibility after the published window; inspect hosted proxy/log behavior in X05/X07 |
| AR-06 | Backup/restore can omit or mismatch assets | Critical / Evidence-gated | T15 coordinated manifests, schedules, state/asset operations, recovery UI and runbooks | X03 provider-native non-no-op state-plus-asset restore/migration/rollback |
| AR-07 | Large composition roots/bundles increase regression cost | High / Residual/monitored | T13 lazy boundaries and touched-domain extraction; enforced size budgets were not raised; final frozen sizes/builds are recorded below | Extract only when a changed domain justifies it |
| AR-08 | Plugin VM is not an OS security boundary | Critical / Accepted trusted-admin boundary | Signed/trusted/approved capability model and typed permission-checked commands | No hostile marketplace claim; X07 independent review |
| AR-09 | AI prompt injection, context leakage or misleading action | High / Residual/evidence-gated | Optional policy, scope/permission intersection, context filtering, citations, audit and transaction revalidation | X07 adversarial security and X08 quality/provider evaluation; preserve governed auto mode |
| AR-10 | Content provenance/attribution lacks independent approval | High / Evidence-gated | Provenance metadata/tests and SRD/user-licensed boundary | X06 release-owner/legal inventory and approval |
| AR-11 | Aggregate validation is resource-sensitive or stale | Medium / Mitigated locally | T07 bounded isolated workers and T19 fresh-evidence gating; three consecutive forced root checks passed with identical package/test/build counts | Preserve fresh-evidence gating and rerun on release candidates |
| AR-12 | Accessibility/device compatibility is automation-only | High / Evidence-gated | Keyboard/DOM/responsive tests and structured accessible review controls | X04 physical AT/browser/device matrix and remediation |
| AR-13 | Audit/operational histories grow without control | Medium / Mitigated locally | T16 permissioned preview/apply retention with measured categories, dry-run, audit and metrics | Validate production thresholds under X05 and publish retention policy |
| AR-14 | Shared writes/auth/privacy regress on a new route | Critical / Residual/monitored | Explicit permissions, exact revisions, idempotency, route matrix and filtered events/snapshots | Keep mutation-contract, privacy and removed-user regressions release-gating; X07 |
| AR-15 | Runtime/OpenAPI/client contracts drift | High / Residual/monitored | Runtime validation, generated/typed contracts, focused route/client tests and repeated green aggregate checks | Maintain version discipline and aggregate release gates |
| AR-16 | Hosted migration/rollback differs from local fixtures | Critical / Evidence-gated | Identity-bound import rollback, checksums, journaling and local recovery tests | X03 target-provider forward migration, restore and rollback with assets |
| AR-17 | Campaign permissions lacked an operable member UI | Medium / Mitigated locally | T10 People panel, role/removal review, owner/self/SCIM guards and removed-session denial | X01 multi-DM/member usability |
| AR-18 | Gridless domain support differed from browser behavior | Low / Mitigated locally | T11 create/edit mode, control suppression, persistence and unsnapped interactions | X01/X04 usability on real maps/devices |
| AR-19 | Death Save lifecycle could diverge from actor/combat state | High / Mitigated locally | T04 atomic resolution including natural 1/20, Stable/dead and counter reset; local acceptance passed | X01 real combat |
| AR-20 | Heroic Inspiration was disconnected from the player loop | Medium / Mitigated locally | T09 visible permissioned grant/transfer/spend/reroll and history; canonical acceptance passed | X01 player use |
| AR-21 | Multiclass scaling reads primary/total level | High / Mitigated locally | T21 central relevant-class-level helpers and multiclass counterexamples | Retain regressions in aggregate gate |
| AR-22 | Monster core rolls reconstruct bonuses | High / Mitigated locally | T22 preserves exact initiative/save/skill values through conversion and rolling | Retain representative stat-block regressions |
| AR-23 | Standard Action and Action Surge diverge | High / Mitigated locally | T23 authoritative turn ledger and exactly one extra Action from Surge | Retain API/SDK/web counterexamples |
| AR-24 | Calculation override explanation differs from play | High / Mitigated locally | T24 one typed override source feeds authoritative values and explanations | Retain world/sheet/roll agreement tests |
| AR-25 | Archive rollback protects the wrong campaign | Critical / Mitigated locally | T25 binds preflight, revision, rollback and mutation to one resolved identity | X03 hosted restore/migration proof |
| AR-26 | Encounter placement leaves partial/duplicate monsters | High / Mitigated locally | T26 resumable idempotent actor/token operation and reconciliation | X01 abandonment/retry sessions |
| AR-27 | Backend capability and browser workflow drift | High / Mitigated locally; monitored | T10-T11 and T32-T34 connect members, gridless, dedicated duplication, streaming and exact search; canonical acceptance passed | Keep capability-to-surface tests and exercise X01/X04 |
| AR-28 | Stored Armor Class intent is ambiguous | High / Mitigated locally | T30 explicit derived/fixed/override provenance and migration/round-trip coverage | Retain import/monster/multiclass counterexamples |
| AR-29 | System-SDK entrypoint exceeds its enforced boundary | Medium / Mitigated locally | T13 touched extraction leaves `packages/system-sdk/src/index.ts` at 17,982 lines under the unchanged 18,000-line ceiling; the frozen module-boundary run passed | Do not raise the ceiling to hide growth |
| AR-30 | Stored roll replay metadata is mistaken for trustless fairness | Medium / Accepted trusted-host boundary | T36 uses one deterministic replay path and contracts/UI state that its hash is recorded with the revealed seed and result | Do not claim commit-before-roll or host seed fairness without a separately witnessed two-phase protocol |
| AR-31 | Controlled-creature review or durable controller identity bypasses current source/authority | High / Mitigated locally | T37 locks complete source `actor.data`, rechecks current membership/workspace on lifecycle mutations and restores only scoped drafts that require re-preview | Retain forged-stat, removed-member, wrong-workspace and reload regressions |

## Aggregate severity interpretation

No audit-identified Critical/High code defect is intentionally left without an implementation. AR-01 and AR-19-AR-31 are now mitigated or explicitly bounded locally, not erased: a future aggregate/canonical regression or a new concrete counterexample reopens the relevant risk immediately.

Public-release blocking risk remains concentrated in AR-06/AR-10/AR-12/AR-16 and the external portions of AR-09/AR-14. Those map directly to X03-X08. A green local suite cannot close them.

## Risk-category assessment

### Rules engine and character data

Prepared typed commands and pure resolvers remain the correct narrow architecture. Central class-level, monster-roll, Action, override, Death Save, Rage, Mastery and Armor Class seams now replace the audited shortcuts. T17 adds typed managed views at API/archive trust boundaries while unknown legacy/homebrew data remains lossless. Do not replace this with a universal rules language; add the next concrete counterexample at the smallest authoritative seam.

The web still derives some presentation capability data locally, so server revalidation and sheet/API agreement tests remain essential. A UI affordance is never permission or rules authority.

### Security and authorization

Strong controls include hashed sessions, explicit permissions, expiring grants, exact revisions, idempotency, request redaction and permission-filtered snapshots/events. T10 adds self-lockout/owner/member guards; T14 reduces URL-token exposure. Residual risks are proxy/log transformations, durable lockout/rate behavior, trusted plugin execution and adversarial AI tool use, all requiring X05/X07.

### Data integrity, migration and ownership

SQLite transactions, dirty tracking, checksummed archives, bounded streaming, identity-bound rollback and resumable archive/encounter operations form a strong local integrity story. T15 coordinates state and assets in code, but provider-native state and object/file snapshots can still differ. X03 is therefore Critical evidence, not optional paperwork.

### Realtime synchronization

Session/org/campaign access is rechecked for websocket joins and outbound state. Sequence gaps recover through permission-filtered authoritative snapshots. This remains a one-process contract. Multi-replica ordering, shared presence and distributed rate limiting are outside the current claim.

### Performance and maintainability

Composition roots remain large, but the enforced approach is incremental extraction and lazy loading. On the final frozen build, main production JavaScript is 800.87 kB (211.85 kB gzip), down from the roughly 988.83 kB audit baseline, while the 557.37 kB dice runtime remains demand-loaded. Production CSS is 233.71 kB (41.48 kB gzip).

### API and plugins

The broad contracts/client surface is useful but raises compatibility cost. Dedicated browser workflows now use their safer API capabilities. Plugins remain typed and permission-checked but trusted-admin; worker/VM restrictions are defense in depth, not hostile isolation.

### AI-specific

Campaign/deployment policy, data selection, permission intersection, citations, audit and transaction validation remain mandatory. Both manual proposal review and governed automatic execution are preserved. X07/X08 determine whether the configured provider, disclosure and observed output quality support a public claim.

### Self-hosting and operations

Containers and recipes do not prove an operating service. Operators still own TLS, secrets, provider durability, backup schedules, upgrades, monitoring and drills. T16/T18 make those responsibilities observable and controllable; X03/X05 prove them in the selected topology.

## Architecture budget snapshot

Physical counts and bundle artifacts from the final frozen local build:

| Root/artifact | Snapshot | Finding |
| --- | --- | --- |
| `apps/api/src/app.ts` | 25,499 lines | High authoritative-route composition blast radius |
| `packages/system-sdk/src/index.ts` | 17,982 lines | Under the unchanged 18,000-line gate after touched extraction |
| `packages/api-contracts/src/index.ts` | 16,302 lines | Contract concentration remains a maintenance risk |
| `apps/web/src/App.tsx` | 11,192 lines | Under the 11,250-line gate at this snapshot; orchestration remains concentrated |
| `apps/api/src/app.test.ts` | 40,388 lines | Large aggregate-suite worker/memory risk |
| Main production web JS | `index-C-sw-hED.js`, 800.87 kB / 211.85 kB gzip | Improved from about 988.83 kB audit baseline |
| Deferred dice runtime | 557.37 kB / 147.01 kB gzip | Demand-loaded rather than part of initial main execution; measure real session loading under X05 |
| Production CSS | 233.71 kB / 41.48 kB gzip | Final frozen build record |

Line counts are guardrails, not refactoring goals. Lower budgets only after stable extraction, and never raise them merely to make a red gate green.

## Recommended next sequence

1. Exercise X01 repeated real-table abandonment, correction, conflict and recovery.
2. Complete X02 provider evidence if OIDC/SCIM is advertised.
3. Prove X03 hosted state-plus-asset recovery and X05 the supported operating envelope.
4. Complete X04 physical accessibility/device evidence.
5. Complete X06 legal, X07 independent security and X08 AI-quality/provider evidence before public beta.
6. Revisit topology only if measured evidence violates the declared single-node boundary.

## Accepted boundaries

- SQLite single-writer and process-local realtime for small-group/internal/private-alpha scope.
- Reviewed manual geometry for cover, pathing, difficult terrain, line of effect and Push placement.
- Explicit manual/unsupported arbitrary prose rather than guessed automation.
- Trusted-admin plugins, not hostile third-party code isolation.
- Bounded streamed archives with published limits.
- Both AI manual review and governed automatic execution behind current controls.
- No proprietary non-SRD distribution without independent rights.
