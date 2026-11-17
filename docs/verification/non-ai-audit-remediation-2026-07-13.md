# Non-AI audit remediation verification - completed through 2026-07-14

## Scope and authority

The product owner directed the repository to implement every code-addressable non-AI P0-P3 finding from the complete D&D 5.5e VTT audit, not only the first ten implementation tickets. The existing AI agent was explicitly excluded: its providers, permissions, tools, manual proposal flow, governed automatic-execution flow, configuration, and capability remain unchanged.

No publish, deployment, commit, stage, push, destructive migration, or user-data operation was authorized or performed by this remediation record.

## Policy corrections

Current contributor/product/security guidance no longer imposes proposal-only AI behavior:

- `AGENTS.md` preserves both AI governance modes and states that a “first ten” list is sequencing only for full implementation requests.
- `SECURITY.md` scopes AI to invoking authority/audit without converting auto execution to proposals.
- `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `prd.md`, `docs/ai/overview.md`, `docs/architecture/overview.md`, and `docs/plugin-sdk/overview.md` align with that direction.
- Historical verification records that mention proposal mechanics are labelled as historical or implementation-specific, not a current universal policy.

## Implemented non-AI scope

### Rules and characters

- Versioned D&D actor/item validation, sourced issues, lossless unknown fields and repair previews.
- Prepared/reviewed, exact-revision, idempotent and audited advancement, rest, action, damage and effect mutations with stale-safe undo.
- Class-aware advancement, subclass, feat/ASI/epic-boon schedules, Constitution HP, multiclassing, Weapon Mastery and durable pending reviews.
- Correct HP/max/temp HP/death saves/stabilization, Short/Long Rest, class resources, Pact Magic and reduced-maximum recovery.
- Mixed multi-component and multi-target typed damage, defenses, critical-at-zero behavior and atomic actor/combatant synchronization.
- Condition immunity across actor/monster/effect/active-attuned-item sources plus reasoned manager override.
- Equipment/attunement/prerequisite/charge gates and reasoned manager-only cursed unattunement recovery.
- Spell known/prepared/always/spellbook/ritual/resource state, concentration and sourced effect lifecycle.
- Controlled creatures, summons, transformations, companions, recharge, advanced/lair/regional/scheduled mechanics.

### Session product

- Complete declared level-one creator, reviewed character policy and import/repair flow.
- Session-first actor actions, loadout, spells, resources, defenses, effects, rests and progression.
- Reviewed encounter participants, initiative/manual order/ties/hidden state, responsive combat controls, monster operation, rewards and history.
- Scene/map/grid/token transforms, accessible placement, targeting/templates, fog/vision/doors/windows/lights/darkness/senses and advisory terrain/cover.
- Profiles/preferences, campaign rules, duplication, archive lifecycle, ownership and character transfer, scene delegation, session scheduling.
- Chat/presence/reconnect, journals/folders/links/backlinks/history/canon, world graph, calculation explanations and compatibility UI.
- Custom D&D content, compendium provenance/conflicts, inventory/containers/commerce/stash/loot, asset renditions/deduplication and outbound webhooks.

### Integrity, security and operations

- Mandatory exact revisions/idempotency on consequential non-AI mutations, deletes and rewards with structured conflicts.
- Serialized durable persistence, nested/array/shape dirty tracking, commit-safe retry baseline and SQLite maintenance/recovery.
- Realtime monotonic sequence, bounded permission-filtered history, delta recovery, authoritative snapshots and presence lifecycle.
- Strict archive schemas/references/D&D invariants/checksums, temp staging, atomic state/object rollback and retry cleanup.
- Additive framed raw-byte campaign archive streaming with backpressure, incremental SHA-256, explicit caps and legacy JSON compatibility.
- OIDC/SCIM/SSRF hardening, scoped worker identities, fail-closed readiness, rate limits, token/URL/log redaction and plugin production defaults.
- Runtime non-AI OpenAPI request and response enforcement plus contracts/client convergence.
- Deterministic migration, deployment, security, performance, soak, capacity, docs, SBOM and release-evidence gates.
- Coherent domain/static-data/panel extraction with architecture/bundle budgets rather than a behavior-changing rewrite.

The ticket-level ledger and acceptance criteria are in `docs/IMPLEMENTATION_BACKLOG.md`.

## Focused regression evidence

Representative suites include:

- `packages/system-sdk/src/p0-rules.test.ts`
- `packages/system-sdk/src/feat-eligibility.test.ts`
- `packages/system-sdk/src/dnd-effect-lifecycle.test.ts`
- `apps/api/src/p0-core-loop-integration.test.ts`
- `apps/api/src/typed-damage-combat-sync.test.ts`
- `apps/api/src/condition-mutation-safety.test.ts`
- `apps/api/src/attunement-api.test.ts`
- `apps/api/src/revision-concurrency.test.ts`
- `apps/api/src/openapi-runtime-validation.test.ts`
- `apps/api/src/archive-stream.test.ts`
- `apps/api/src/sqlite-store.test.ts`
- `apps/api/src/realtime-snapshot-delta.test.ts` or the corresponding web/API reconciliation suites
- actor loadout, condition, attunement, advancement, typed-damage, combat and responsive tests in `apps/web/src`
- `tests/e2e/auth-tabletop.spec.ts` and `tests/e2e/browser-evidence.spec.ts`

## Consolidated validation

<!-- FINAL_VALIDATION_RESULTS -->
- `pnpm check`: **28/28 lint**, **28/28 typecheck**, E2E TypeScript, **28/28 test**, and **17/17 build** targets passed. Key package totals were API **89 files / 611 passed / 1 skipped**, web **92 / 458**, system SDK **20 / 159**, core **10 / 75**, API contracts **15 / 72**, API client **9 / 38**, and worker **1 / 27**.
- The strict standalone API JSON run independently passed **89/89 files and 611/612 tests** in 190.3 seconds. Its only skip is the live identity-provider smoke, which requires external OIDC/SCIM endpoint and credential variables.
- Browser acceptance passed **49/49** normal Chromium tests in 7.3 minutes plus **1/1** clean-bootstrap test in 56.5 seconds; browser TypeScript passed and all seven tracked screenshots remained unchanged.
- Production dependency audit reported **no known vulnerabilities**. Security smoke passed **7/7**, migration smoke **2/2**, deployment smoke **2/2**, and the selected performance smoke and soak tests passed.
- Local capacity passed for **1 GM, 5 players, 6 realtime clients, 200 tokens, 302 observed chat messages, and 60 journals**: P95 **18.661/65.14/40.826/40.905/2.748 ms** for connect/read/mutation/fanout/reconnect, **379.23 ms** total, **372,736-byte** SQLite store, and successful reopen persistence.
- Documentation site tests/check, SBOM test, release-evidence test, issue-check fixture test, and `git diff --check` passed. The combined release command and live GitHub issue check remain intentionally unclaimed because they require, respectively, a clean publication worktree and authenticated external state.
<!-- /FINAL_VALIDATION_RESULTS -->

## External/manual release evidence

Local code cannot manufacture the following results:

- repeated real GM/player campaigns without database repair;
- live OIDC and SCIM against selected providers over hosted HTTPS;
- manual NVDA, Narrator, VoiceOver and TalkBack checks plus Edge, Firefox, Safari and representative physical touch devices;
- hosted HTTPS backup/restore, forward migration, rollback, capacity, observability, alerting and support drills;
- release-owner legal/content/provenance approval plus an independent security review.

These are stage gates, not unimplemented code tickets. The product must not claim them green until their artifacts exist.

## AI non-change verification

This remediation intentionally made no AI behavior or provider change. Any pre-existing dirty `packages/ai-core`, AI gateway, AI panel or provider files remain outside the scope of this non-AI verification. Policy documentation was corrected so future safety work cannot silently convert governed automatic execution into proposal-only behavior.
