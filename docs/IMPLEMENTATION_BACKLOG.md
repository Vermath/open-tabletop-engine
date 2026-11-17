# Implementation Backlog

## 2026-07-17 remediation closure ledger (authoritative)

This ledger supersedes conflicting open statuses below. The earlier specifications remain the acceptance history. “Closed in working tree” means implemented with focused regression coverage in the current uncommitted tree; it does not mean committed, deployed, or externally accepted.

| Ticket | Current disposition |
|---|---|
| N01 | Closed in working tree - critical outcome is preserved through typed damage, commit, replay, and undo. |
| N02 | Closed in working tree - actor/combatant recovery and death-save state synchronize bidirectionally. |
| N03 | Closed in working tree - action preview/continuation state is deterministically bound and race-covered. |
| N04 | Closed in working tree - batch token movement preflights permissions and commits atomically. |
| N05 | Closed in working tree - API gate resources, timeouts, diagnostics, and evidence are bounded and isolated. |
| N06 | Closed in working tree - provider streaming occurs between short durable phases without proposal-only conversion. |
| N07 | Code closed in working tree - Compose security/configuration and paired state-plus-asset backups are wired; independent hosted proof remains X03. |
| N08 | Closed in working tree - combat vitals, damage/heal/temp HP, defeat/recovery, and roster controls are direct and permission checked. |
| N09 | Closed in working tree - versioned drafts are scoped, resumable, discardable, and cleared only after successful reconciliation. |
| N10 | Closed in working tree - standard-array inputs, boosts, preview, persistence, and provenance are authoritative. |
| N11 | Closed in working tree - spell acquisition, grant source, and casting ability cover SRD classes/multiclass fixtures. |
| N12 | Closed in working tree - effective speed derives from class prerequisites and live owned-item revisions. |
| N13 | Closed in working tree - explicit selected subclass gates features even when imports contain stale names. |
| N14 | Closed in working tree - upload, background, calibration, and readiness refer to one scene and one flow. |
| N15 | Closed in working tree - prior silent caps expose search, paging, or show-all behavior. |
| N16 | Closed in working tree - handouts render safely and journal drafts recover explicitly. |
| N17 | Closed in working tree - hardened cookie transport, CSP, revocation, and bounded compatibility replace long-lived local storage. |
| N18 | Closed in working tree - proxy/account-aware throttling and bounded async password verification are covered. |
| N19 | Closed in working tree - selected AI/agent routes have contract, revision/idempotency, ordering, and gap-recovery parity. |
| N20 | Closed in working tree - a deliberately bounded managed-effect lifecycle is authoritative; universal effect automation remains out of scope. |

T38-T42 and T44-T48 are closed in the working tree; T43 is closed as an SRD content decision (do not add non-SRD Aasimar content on a parity assumption). X01-X08 are the only remaining audit gates and are external/manual evidence, not hidden implementation tickets. Any code defect discovered while collecting that evidence reopens as a new ticket with an authoritative path and regression.

### Release qualification queue

RQ01 final local qualification is **complete locally as of 2026-07-17**: `pnpm check`, aggregate/default 62/62 plus bootstrap 1/1, canonical 1/1, full Level 3 combat 1/1, documentation validation, and diff hygiene are green on the exact working tree. RQ02 independent quickstart is next. RQ03-RQ10 remain the ordered X01/X03/X05/X04/X06-X08 evidence and findings-closure work defined in `PRODUCT_ROADMAP.md`; they are not silently replaced by more feature implementation.

## 2026-07-16 implementation backlog addendum (authoritative)

This addendum replaces the "small hygiene tranche only" conclusion below. Historical ticket records remain valid as history. Current ticket status is evaluated against committed HEAD `9de6a3c` plus the uncommitted tree; "implemented in working tree" is not "released" or "accepted."

### Historical-ticket status corrections

| Ticket | Current status |
|---|---|
| T38 - Second Wind action kind | Implemented in the working tree; focused tests pass; release acceptance waits on a committed tranche and stable aggregate gate. |
| T39 - activation metadata / Tactical Mind | Implemented in the working tree; focused tests pass; release acceptance waits on the aggregate gate. |
| T40 - machine-readable release evidence | Implemented/extended in the working tree; evidence gate passes with 61 records; not released. |
| T41 - local gate drift | Implemented/extended in the working tree; fast gate passes; not sufficient to close the full-suite instability. |
| T43 - Aasimar decision | Close as not a defect. Aasimar is not in official SRD 5.2.1; do not add non-SRD content on a parity assumption. |
| T48 - default E2E semantics | Implementation exists in the working tree, but acceptance is not met: the canonical public journey failed once and passed on immediate rerun. |

### Epic map

| Epic | Outcome | Priority |
|---|---|---|
| E1 - Authoritative combat integrity | One correct, transactional answer for attack, damage, HP, defeat, recovery, and movement | P0 |
| E2 - Deterministic release and operations | Repeatable gates, non-blocking mutations, verified install/backup path | P0/P1 |
| E3 - Session-speed DM/player loop | Routine combat and setup work stays in the primary surfaces without hidden or lost state | P1 |
| E4 - Character and SRD depth | Legal creation/advancement with authoritative grant source and derived statistics | P1 |
| E5 - Recurring-campaign trust | Reconnect, drafts, handouts/chat, restore, browser security, and accessibility | P1/P2 |

### Epic specifications

#### E1 - Authoritative combat integrity

- **Problem / user value:** visible combat state can disagree across attack, damage, actor, combatant, and grouped token operations. Players and DMs need one inspectable, undoable truth.
- **Scope / non-goals:** N01-N04: critical propagation, recovery projection, deterministic continuation state, and atomic batch movement. Do not add terrain pathfinding, opportunity-attack automation, or a universal effect engine.
- **Dependencies / relevant code:** begins without external dependencies; coordinates `packages/system-sdk/src/dnd-action-continuations.ts`, rules completion and life-state helpers, `packages/core` commands, `apps/api/src/app.ts`, `apps/web/src/App.tsx` and scene canvas, combat/E2E fixtures.
- **Technical / rules / data / API approach:** pure typed resolver or projection followed by validation, revision/idempotency, one transaction/event, and undo. Add only the critical and batch/projection fields needed by D&D attack, HP, defeat, and movement semantics.
- **UI / security / migration implications:** surface authoritative preview IDs and denial reasons; server preflights every target/token permission; use additive contract/archive compatibility and preserve existing single-action clients during migration.
- **Test strategy / acceptance / done:** exhaustive rules matrices, transaction rollback, replay/undo, delayed realtime, two-client E2E, and 10/10 canonical clean runs. Done when no partial or contradictory state is possible on the covered paths and release evidence is recorded.
- **Effort / confidence:** L / High.

#### E2 - Deterministic release and operations

- **Problem / user value:** flaky gates, a global AI mutation lock, and contradictory self-host/backup configuration prevent maintainers and operators from trusting a release.
- **Scope / non-goals:** N05-N07: bounded aggregate tests, short AI durable phases, one verified Compose and paired backup/restore path. Do not build HA, microservices, a new provider framework, or public cloud orchestration.
- **Dependencies / relevant code:** N05 enables acceptance for all other work; relevant surfaces are API Vitest lifecycle, `apps/api/src/app.ts`, AI providers, durable coordinator, `docker-compose.yml`, runtime/storage validation, asset operations, gate scripts, and operator docs.
- **Technical / rules / data / API approach:** isolate test resources; persist only short pending/final AI phases around external waits; add a versioned paired backup manifest and health evidence; preserve all authoritative D&D command validation.
- **UI / security / migration implications:** no broad UI beyond honest health/diagnostics; keep AI permissions and automatic execution; do not weaken remote storage TLS/SSRF policy; rehearse upgrade/rollback and restore from a previous supported archive.
- **Test strategy / acceptance / done:** two cold aggregate passes, delayed-provider concurrency/cancellation, clean Compose boot, scheduled paired backup, clean restore, and independent install. Done when all paths are bounded, documented, and reproducible.
- **Effort / confidence:** L / Medium.

#### E3 - Session-speed DM/player loop

- **Problem / user value:** ordinary users leave the main workflow, lose drafts, or cannot find records during setup and combat.
- **Scope / non-goals:** combat HP/roster controls, resumable creator drafts, correct onboarding/map setup, paging/show-all, clear empty/loading/error/success states. Do not redesign the visual system or add broad social/cosmetic features.
- **Dependencies / relevant code:** depends on E1 life-state correctness; primarily `combat-panel.tsx`, `character-creator-dialog.tsx`, campaign setup steps, map/background/grid components, sheet/list panels, and existing typed APIs.
- **Technical / rules / data / API approach:** compose existing server commands; version client drafts first; add paging/query contracts only where caps hide real data; derive setup readiness from one scene. D&D calculations stay server/shared-rule authoritative.
- **UI / security / migration implications:** keyboard and small-screen task completion are acceptance criteria; permissions and disabled reasons remain explicit; draft keys are account/campaign scoped and cleared on commit; contract changes are additive.
- **Test strategy / acceptance / done:** component state/permission tests, E2E close/reload/recover, full-combat panel use, campaign-scale list fixtures, and moderated first-session manual test. Done when no required task loses or silently hides state.
- **Effort / confidence:** L / High.

#### E4 - Character and SRD depth

- **Problem / user value:** creation and advancement can produce incomplete or incorrectly attributed character mechanics, especially for spellcasters and class/subclass movement features.
- **Scope / non-goals:** standard-array assignment, class-complete spell acquisition/grant source/casting ability, effective speed, and selected-subclass gating. Defer point buy/rolled methods, every persistent spell, and non-SRD content.
- **Dependencies / relevant code:** creator drafts from E3; shared types in `packages/core`, validation/preview and feature generation in `packages/system-sdk`, API creation/advancement routes, web creator/advancement/sheet surfaces, archive fixtures.
- **Technical / rules / data / API approach:** typed method/grant-source metadata; pure derived statistics; per-class validation fixtures; explicit homebrew grants rather than name inference. Persist inputs/provenance and derive display values.
- **UI / security / migration implications:** field-level legal-choice errors plus DM-visible manual override boundaries; players may edit only authorized actors; additive migration preserves unknown/homebrew roots and existing presets.
- **Test strategy / acceptance / done:** exhaustive ability permutations, every SRD casting class plus multiclass fixtures, speed prerequisite matrix, negative subclass tests, API/archive round trip, creator/advancement E2E, and manual sheet calculation review.
- **Effort / confidence:** XL / Medium.

#### E5 - Recurring-campaign and public trust

- **Problem / user value:** campaign-scale information, reconnect, restore, browser security, and accessibility are not yet dependable enough for external users.
- **Scope / non-goals:** journal/handout drafts and presentation, search/paging/chat decisions, realtime parity, cookie/CSP/rate defenses, scanner policy, supply-chain pinning, keyboard/responsive core tasks, hosted recovery evidence. Do not add voice/video, a marketplace, or social-network features.
- **Dependencies / relevant code:** follows stable E1/E2 contracts; journals/handouts/chat, realtime sequencing, session transport/static hosting, authentication throttles, scanner/webhook URL policy, dependency configuration, board input model, migrations and public docs.
- **Technical / rules / data / API approach:** extend existing sequence/session/permission primitives; use explicit content visibility/provenance; migrate tokens with revocation/compatibility; reuse one outbound-target validator; version all persisted changes.
- **UI / security / migration implications:** untrusted-user threat model and WCAG task completion are gates; preserve campaign ownership/export; publish compatibility, privacy, AI-provider, and manual-rules boundaries.
- **Test strategy / acceptance / done:** reconnect/gap tests, security integration and independent review, keyboard/device audit, migration/rollback, restore/load evidence, and recurring external sessions. Done only when no unaccepted Critical/High public risk remains.
- **Effort / confidence:** XL / Medium.


## First ten implementation tickets, in order

### N01 - Propagate critical attack outcomes into damage (E1, P0)

- **Objective:** make attack and damage one rules-consistent continuation, including expanded critical ranges.
- **User outcome:** when the table sees a critical hit, the committed damage and audit trail are unambiguously critical.
- **Likely files:** `packages/system-sdk/src/dnd-action-continuations.ts`, `packages/system-sdk/src/dnd-rules-completion.ts`, `packages/system-sdk/src/index.ts`, shared continuation types in `packages/core`, focused API/System SDK tests.
- **Architecture constraints:** keep the hit resolver pure; add typed metadata rather than parsing labels/formulas; calculate threshold server-side; preserve revision, idempotency, transaction, undo, and provenance behavior.
- **D&D 5.5e rule interaction:** critical damage dice, natural d20 result, Champion expanded range, Sneak Attack and other extra dice, and effects that negate criticals.
- **Acceptance criteria:** continuation records natural result, applied threshold, and final critical verdict; damage doubles only rollable dice; modifiers are not doubled; negation is honored; replay/undo cannot change the verdict.
- **Tests:** **Unit:** formula transformation and weapon/spell/Sneak Attack/Champion/negation matrix. **Integration:** API commit, replay, and undo. **E2E:** displayed and stored critical damage agree. **Manual:** inspect the audit log and dice breakdown.
- **Must not change:** normal hit probability, non-critical formulas, AI automatic execution model, or direct permission semantics.
- **Dependencies:** none.
- **Effort / confidence:** M / High.

### N02 - Synchronize actor and combatant recovery bidirectionally (E1, P0)

- **Objective:** make active-combat life state a projection of the authoritative actor transition in the same durable mutation.
- **User outcome:** healing above 0 HP immediately returns the creature to a coherent combat state.
- **Likely files:** `apps/api/src/app.ts`, life-state helpers in `packages/system-sdk/src/index.ts`, combat API tests, reconnect/undo fixtures.
- **Architecture constraints:** no second best-effort request; update actor and matching combatant transactionally; use IDs, not names; keep server authority.
- **D&D 5.5e rule interaction:** healing from 0, defeated state, death-save reset, stabilization, damage back to 0.
- **Acceptance criteria:** healing clears actor and combatant defeat/death-save state; damage to 0 sets both; unaffected combatants do not change; undo and replay restore the exact prior pair.
- **Tests:** **Unit:** actor/combatant life-state transition matrix. **Integration:** API transaction, undo, replay, and reconnect snapshot. **E2E:** defeated -> healed -> acts on turn. **Manual:** multi-combatant recovery smoke.
- **Must not change:** existing permission checks, negative-HP policy, concentration handling, or archive schema unless an additive migration is required.
- **Dependencies:** none.
- **Effort / confidence:** S / High.

### N03 - Remove the attack-damage continuation race (E1/E2, P0)

- **Objective:** make "Use previewed action" deterministically enabled when the current authoritative preview is usable.
- **User outcome:** a player never stalls after a successful hit with a visible damage preview.
- **Likely files:** `apps/web/src/App.tsx`, action/preview state helpers, API response/realtime reconciliation, `tests/e2e/canonical-public-journey.spec.ts`, full-combat journey fixtures.
- **Architecture constraints:** fix the product race, not the test with sleeps; use a stable action/preview identity and explicit state transition; tolerate duplicate/reordered realtime delivery.
- **D&D 5.5e rule interaction:** preserves the attack -> damage sequence and any critical metadata from N01.
- **Acceptance criteria:** the button state derives from one current preview identity; stale revisions are explained and refreshable; ten consecutive clean canonical runs pass; artificial delayed/reordered events do not strand the UI.
- **Tests:** **Unit:** reducer/state-machine transitions. **Integration:** API/realtime delay, reorder, and stale-revision cases. **E2E:** canonical 10-run clean loop. **Manual:** slow-network browser check.
- **Must not change:** server outcome authority, revision guards, or bypass preview validation.
- **Dependencies:** coordinate with N01; can begin in parallel.
- **Effort / confidence:** M / Medium.

### N04 - Add an atomic permission-checked batch token move (E1, P0)

- **Objective:** replace independent multi-token requests with one typed all-or-nothing command.
- **User outcome:** a group drag either moves every authorized token or moves none and identifies the rejection.
- **Likely files:** `apps/web/src/scene-canvas.tsx`, `apps/web/src/App.tsx`, API contracts, `packages/core` command types, `apps/api/src/app.ts`, persistence transaction tests.
- **Architecture constraints:** plugins and web use the same typed domain command; preflight every token permission and scene/revision invariant; one transaction and one ordered audit event; no direct storage mutation.
- **D&D 5.5e rule interaction:** movement remains table-position state; do not silently add opportunity attack, terrain, or pathfinding enforcement.
- **Acceptance criteria:** mixed authority rejects before any write; conflicts reject or rebase explicitly; one undo restores all positions; realtime clients receive a coherent batch.
- **Tests:** **Unit:** permission and batch-validation matrix. **Integration:** atomic rollback, conflict, idempotency, and undo. **E2E:** two-client coherent batch. **Manual:** mixed-owned/unowned selection.
- **Must not change:** single-token drag behavior, GM override policy, grid snapping, or tactical-aid optionality.
- **Dependencies:** none.
- **Effort / confidence:** M / High.

### N05 - Make the aggregate API/release suite bounded and deterministic (E2, P0)

- **Objective:** turn the full gate into reliable evidence instead of a long-running probabilistic signal.
- **User outcome:** release candidates do not ship with hidden state or timing regressions.
- **Likely files:** `apps/api/src/app.test.ts`, API Vitest setup/configuration, shared test server/fixture lifecycle, workspace gate scripts, CI artifact collection.
- **Architecture constraints:** preserve test coverage; isolate shared ports, clocks, databases, and worker state; use explicit readiness and bounded teardown; do not mask failures with blanket timeout increases or retries.
- **D&D 5.5e rule interaction:** retain all action-economy, advancement, combat, and archive matrices in the aggregate evidence.
- **Acceptance criteria:** `pnpm check` completes within a documented bound twice from cold state; no worker RPC errors; timed-out tests retain logs and active-resource diagnostics; sharding, if used, preserves isolation.
- **Tests:** **Unit:** fixture lifecycle and diagnostic parser. **Integration:** high-contention suites in randomized order and complete gate twice. **E2E:** existing canonical/full-combat release gates, with no sleep/retry substitution. **Manual:** inspect the artifact from an intentionally broken fixture.
- **Must not change:** production runtime behavior or delete slow but valuable coverage solely to meet the bound.
- **Dependencies:** none; required before claiming any dirty-tree ticket released.
- **Effort / confidence:** M / Medium.

### N06 - Keep streamed AI work outside the global mutation critical section (E2, P0 when AI is enabled)

- **Objective:** prevent provider latency from blocking unrelated campaign writes while preserving automatic execution.
- **User outcome:** a slow AI turn cannot freeze token moves, combat actions, saves, or admin mutations.
- **Likely files:** `apps/api/src/app.ts`, AI provider/stream orchestration, durable mutation coordinator tests, AI thread persistence helpers.
- **Architecture constraints:** split the flow into short durable phases: authorize/create pending state, release lock, perform provider stream, reacquire for validated commits; preserve automatic typed commands, citations, permissions, cancellation, and idempotency.
- **D&D 5.5e rule interaction:** AI-generated actions remain subject to the same authoritative rule previews and commands as human actions.
- **Acceptance criteria:** an intentionally delayed provider does not delay an unrelated mutation beyond the normal persistence bound; cancellation leaves a terminal thread state; duplicate completion cannot double-apply commands.
- **Tests:** **Unit:** pending/final phase, cancellation, and idempotency transitions. **Integration:** delayed/failing provider concurrency and retry. **E2E:** two clients stream AI while combat mutates. **Manual:** provider stream plus combat smoke.
- **Must not change:** automatic execution into proposal-only, permission requirements, prompt-injection labeling, or provider timeout policy except where separately justified.
- **Dependencies:** none.
- **Effort / confidence:** M / Medium.

### N07 - Repair and prove the Docker quickstart and backup wiring (E2, P0; M3 exit gate)

- **Objective:** make the documented production Compose profile boot, report healthy, schedule paired backups, and restore.
- **User outcome:** an operator following the README reaches a usable, recoverable table without reverse-engineering environment variables.
- **Likely files:** `docker-compose.yml`, `.env.example`, `apps/api/src/runtime.ts`, `apps/api/src/asset-operations.ts`, Dockerfiles, operator/backup docs, deployment smoke.
- **Architecture constraints:** production TLS/storage policy and local MinIO profile must agree explicitly; never weaken remote-endpoint SSRF/TLS validation globally; secrets remain external and documented.
- **D&D 5.5e rule interaction:** none, but campaign assets and state must restore as one usable game.
- **Acceptance criteria:** clean documented boot succeeds; signing secret is required/generated coherently; scheduler variables reach runtime and health status; backup pairs DB/assets; clean restore passes checksums and representative campaign smoke.
- **Tests:** **Unit:** invalid configuration and manifest validation. **Integration:** scheduled paired backup and checksum restore. **E2E:** clean Compose deployment plus isolated-volume restore drill. **Manual:** independent install, upgrade, and restore from the published runbook.
- **Must not change:** production remote S3 security posture, archive bounds, or checked-in real secrets.
- **Dependencies:** N05 for reliable release evidence.
- **Effort / confidence:** M / High.

### N08 - Put routine HP and roster control in the combat panel (E3, P1)

- **Objective:** make the live combat surface sufficient for ordinary turn administration.
- **User outcome:** an authorized DM can apply damage/healing/temp HP and add/remove combatants without leaving initiative context.
- **Likely files:** `apps/web/src/combat-panel.tsx`, `apps/web/src/App.tsx`, existing actor/combat commands and API contracts, accessibility tests.
- **Architecture constraints:** compose existing typed commands; do not duplicate HP math in the browser; optimistic UI must reconcile to authoritative responses; all controls expose permission/disabled reasons.
- **D&D 5.5e rule interaction:** typed damage, resistance/immunity/vulnerability, temp HP, 0-HP transitions, concentration, and N02 recovery.
- **Acceptance criteria:** selected combatant supports previewed damage, healing, temp HP, and roster operations; turn/round context remains visible; unauthorized players cannot invoke DM operations; errors preserve state.
- **Tests:** **Unit:** component permissions and disabled reasons. **Integration:** existing actor/combat command APIs. **E2E:** full combat including 0 -> healed and roster changes. **Manual:** keyboard and small-screen smoke.
- **Must not change:** actor sheet capabilities, server authority, or concealment permissions.
- **Dependencies:** N02; N01 for critical display consistency.
- **Effort / confidence:** M / High.

### N09 - Add resumable, explicitly discardable character-creator drafts (E3, P1)

- **Objective:** eliminate accidental loss during a multi-step character build.
- **User outcome:** closing, reloading, or signing back in offers the last valid draft and never silently destroys it.
- **Likely files:** `apps/web/src/character-creator-dialog.tsx`, a small versioned draft adapter, modal close/escape handling, creator component tests.
- **Architecture constraints:** reuse the existing request shape; store only scoped draft data with schema version and campaign/user key; clear on successful commit; avoid a new backend draft service unless multi-device evidence demands it.
- **D&D 5.5e rule interaction:** preserve class/species/background/origin/ability choices and validation previews exactly.
- **Acceptance criteria:** backdrop, close, Escape, reload, and recover flows are explicit; invalid stale drafts migrate or offer safe discard; successful creation clears the draft; switching campaign/account cannot leak a draft.
- **Tests:** **Unit:** reducer, draft adapter, schema version, and scoping. **Integration:** component close/recover/commit-clear behavior. **E2E:** reload midway and resume. **Manual:** invalid-version and shared-browser checks.
- **Must not change:** authoritative server validation or auto-submit a draft.
- **Dependencies:** none; coordinate schema with N10.
- **Effort / confidence:** S / High.

### N10 - Ship authoritative standard-array assignment (E4, P1)

- **Objective:** complete one legal, auditable base ability-score method end to end.
- **User outcome:** a player can assign the standard array, apply allowed background boosts, preview derived statistics, and create the intended character.
- **Likely files:** shared creation request/types in `packages/core`, validation/preview in `packages/system-sdk`, `apps/api/src/app.ts`, `apps/web/src/character-creator-dialog.tsx`, archive/provenance fixtures.
- **Architecture constraints:** model a method discriminator and explicit six-score assignment; validate permutation and boost constraints server-side; keep UI preview derived from shared rules; additive schema/migration only.
- **D&D 5.5e rule interaction:** base ability assignment, background increases, ability maximums, and derived modifiers/saves/AC/HP.
- **Acceptance criteria:** every legal permutation is accepted; duplicates/out-of-set values and invalid boosts are rejected with field errors; preview and committed actor agree; provenance records method and inputs.
- **Tests:** **Unit:** exhaustive permutation/property and boundary validation. **Integration:** API create/preview/archive round trip. **E2E:** creator completion. **Manual:** calculation and accessibility review.
- **Must not change:** existing presets without migration, homebrew import behavior, or add point buy/rolled stats in this PR.
- **Dependencies:** N09 draft schema coordination.
- **Effort / confidence:** M / High.

## Next queue after the first ten

| Order | Ticket | Priority / effort |
|---:|---|---|
| 11 | Class-complete spell acquisition and spellcasting-ability attribution | P1 / L |
| 12 | Effective speed derivation for Monk/Barbarian and prerequisites | P1 / S |
| 13 | Selected-subclass gating for Open Hand and similar features | P1 / XS |
| 14 | Correct onboarding readiness and unify upload -> background -> grid setup | P1 / M |
| 15 | Replace silent sheet/invite/placement caps with show-all, search, or paging | P1 / S-M |
| 16 | Rendered handouts and journal draft recovery | P2 / M |
| 17 | Cookie session migration, CSP, token revocation, and compatibility plan | P2 / L |
| 18 | Proxy/account-aware login throttling with async password verification controls | P2 / M |
| 19 | Realtime sequence, revision, and OpenAPI validation parity for AI/agent surfaces | P1 / M |
| 20 | Small managed-effect lifecycle selected from recurring-play evidence | P2 / L |

### Definition of done for new tickets

A ticket is complete only when its authoritative path, connected user surface, explicit permissions, persistence/recovery behavior, compatibility impact, focused tests, and required release evidence are present. "Implemented in a dirty tree," "passes in isolation," and "the browser test passed once" are intermediate states, not done.


> **Historical backlog below is retained for ticket traceability only.** Its open/closed statuses and recommended order are superseded by the authoritative epic specifications and N01-N20 sequence above.

> Re-issued 2026-07-15 at committed HEAD `b5e30f1`, clean tree. T01–T37 are committed and independently re-verified (spot-traced in code; representative paths exercised live — see `FEATURE_AUDIT.md`). This revision adds the **T38–T45 correctness/hygiene tranche** discovered by the re-audit. External/manual items X01–X08 are unchanged and listed at the end.

## Status meanings

| Status | Meaning |
| --- | --- |
| Committed | Landed at or before `b5e30f1`; regression coverage present |
| Open | Specified below, not started |
| External/manual | Cannot be closed by repository changes alone |

## Shared constraints (apply to every ticket)

- Preserve exact revisions, idempotency, authorization, audit history, permission-filtered realtime.
- Prefer typed commands and `packages/core` domain types over raw storage mutation.
- Preserve legacy/homebrew data outside managed typed D&D subroots.
- Keep geometry/prose rulings explicit; never guess.
- Preserve both AI modes (manual review + governed auto) behind existing policy.
- Add the smallest regression that fails for the fixed counterexample.
- Route additions must satisfy both app.test.ts route-coverage gates (auth matrix + MCP surface classification).

## Closed ledger (T01–T37)

All committed. See `DND_RULES_AUDIT.md` for the per-ticket resolution table and `FEATURE_AUDIT.md` for verification status per area. Not repeated here to keep this file actionable.

## Open tranche T38–T45

### T38 — Second Wind must be a Bonus Action (P0, XS, High confidence)

- **Objective:** the Second Wind quick roll stops consuming the turn's standard Action.
- **User-facing outcome:** a Fighter can use Second Wind and still attack on the same turn; the review dialog and audit trail say "Bonus Action".
- **D&D rules involved:** Second Wind (SRD 5.2.1 Fighter): Bonus Action, 1d10 + Fighter level, limited uses, short-rest recovery.
- **Likely files:** `packages/system-sdk/src/index.ts` (~1268, `dnd5eSrdClassFeatureRolls` — add `action: "Bonus Action"` to the roll metadata, merging with the existing optional `tacticalShift` metadata); `packages/system-sdk/src/dnd-action-economy.test.ts` (classifier regression); `apps/api/src/dnd-action-economy-api.test.ts` (end-to-end counterexample: use Second Wind then attack in the same turn — attack must not be blocked).
- **Root cause note:** `dnd5eSrdActionKind` (`dnd-action-economy.ts:9`) defaults metadata-less rolls with a non-"0" formula to `"action"`. Fix the data, keep the conservative default, and add the audit sweep from T39.
- **Constraints:** do not change the classifier's default behavior in this ticket; do not touch the ledger shape (persisted in actor `rulesEngine.actionEconomy`).
- **Acceptance criteria:** classifier returns `bonusAction` for the Second Wind roll; live resolution ledger no longer increments `actionsUsed`; existing Action Surge tests unchanged.
- **Tests:** unit (classifier), API integration (same-turn Second Wind → attack), no E2E needed.
- **Manual verification:** demo campaign — start combat, use Second Wind, confirm Longsword attack still commits.
- **Must not change:** spell action classification; Rage metadata; ledger persistence shape.
- **Dependencies:** none. Do first.

### T39 — Audit activation metadata for all feature rolls; fix Tactical Mind (P1, S, High)

- **Objective:** every quick roll produced by `dnd5eSrdClassFeatureRolls`, `dnd5eSrdSpeciesTraitRolls`, and `dnd5eSrdMonsterActionRolls` carries explicit activation metadata (or is intentionally `free`), enforced by a test that fails when a new metadata-less roll appears.
- **User-facing outcome:** no feature silently costs the wrong economy slot; Tactical Mind stops consuming the Action.
- **Rules involved:** Tactical Mind augments an ability check by expending a Second Wind use (not an Action); general 5.5e action/bonus-action/reaction taxonomy.
- **Likely files:** `packages/system-sdk/src/index.ts` (feature/species/monster roll builders), `dnd-action-economy.ts` (optionally add an `activationRequired` helper), new sweep test in `packages/system-sdk/src/dnd-action-economy.test.ts` iterating representative actors (each class at levels 1/3/5, one monster) and asserting every generated roll classifies deliberately.
- **Acceptance criteria:** sweep test enumerates zero unclassified rolls; Tactical Mind classifies `free` with its resource spend still reviewed.
- **Tests:** the sweep itself + Tactical Mind counterexample.
- **Must not change:** existing correct classifications (Rage bonus action, spell `action` data).
- **Dependencies:** T38 (same seam; ship as one PR).

### T40 — Persist machine-readable release-gate evidence (P1, S, Medium)

- **Objective:** `pnpm check` and the canonical journey can emit a small JSON evidence artifact (commit SHA, command, per-package task results, test counts, duration, timestamp) into `artifacts/release-evidence/`, and `scripts/check-v1-release-evidence.mjs` recognizes it.
- **Why:** the prior audit cited frozen-run identifiers that are not reproducible from the repo; this audit had to re-derive everything. Fresh evidence should be cheap to persist and verify.
- **User-facing outcome (team):** audit/release docs cite artifact files instead of prose numbers.
- **Likely files:** new `scripts/record-release-evidence.mjs` (wraps `pnpm check` / playwright, parses turbo + vitest summaries), `scripts/check-v1-release-evidence.mjs` (accept the new artifact class), `.gitignore` decision (commit evidence for tagged candidates only).
- **Acceptance criteria:** one command produces an artifact that the evidence checker validates against current HEAD; stale-commit artifacts are rejected (existing behavior preserved).
- **Tests:** script unit test with fixture summaries (repo already tests scripts, e.g. `sbom:test` pattern).
- **Must not change:** the gates themselves.
- **Dependencies:** none; unblocks stage exits.

### T41 — Close the local gate-drift window (P1, XS, Medium)

- **Objective:** make it hard to commit a root-script/config change that breaks the pinned deployment-smoke guard without noticing locally.
- **Why (evidence):** commit `63d5950` changed `security:audit` and broke the pin for ~16 minutes until `b5e30f1`; CI would have caught it post-push, but the local loop didn't.
- **Approach (smallest):** add `deployment-smoke` to a fast pre-push script (`pnpm gate:fast`: deployment-smoke + contracts tests, <30s) and document it in `CONTRIBUTING.md`; optionally a git `pre-push` hook sample. Do **not** slow the default commit path.
- **Acceptance criteria:** `pnpm gate:fast` exists, runs <60s, and fails on a reproduced `63d5950`-style mismatch.
- **Dependencies:** none.

### T42 — Legendary-action economy on the combat tracker (P2, M, Medium)

- **Objective:** legendary creatures get a per-round-resetting legendary-action use pool with a between-turns prompt; option choice and targeting stay manual.
- **User-facing outcome:** running an SRD legendary creature (e.g., sphinx-class blocks) no longer requires hand-tracking uses; the tracker offers "Legendary action available (2/3)" after each other creature's turn.
- **Rules involved:** legendary actions: N uses/round, spent at the end of other creatures' turns, reset at the start of the creature's turn (per stat block).
- **Likely files:** `packages/system-sdk/src/dnd-advanced-mechanics.ts` (reuse the `CombatEnvironmentMechanic` scheduling shape), `dnd-monster-stat-blocks.ts` (structured `legendaryActions: { uses, options[] }` on the 14 affected blocks, keeping prose), combat progression synchronizer, `apps/web` combat panel drawer, API tests.
- **Non-goals:** auto-resolving options; lair-action changes (already scheduled); legendary resistance automation (separate decision; keep manual with a counter if trivial).
- **Acceptance criteria:** uses decrement on spend, reset on the creature's turn start, never exceed the block's count; prompt appears only between turns; all reviewed/manual.
- **Tests:** SDK unit (reset/spend/bounds), API integration (combat with a legendary block), web panel test.
- **Dependencies:** none, but schedule after X01 begins — real-table priority may differ.

### T43 — Species coverage decision: Aasimar (P2, S–M, Medium)

- **Objective:** check the SRD 5.2.1 species index once; if Aasimar is included, add the species record (traits, resistances, spell-like features) at parity with the other nine; if not, document the boundary in `docs/system-sdk/overview.md`.
- **Evidence:** zero "Aasimar" occurrences in `packages/system-sdk/src`; nine species implemented.
- **Acceptance criteria:** either a playable Aasimar with creator/advancement/tests, or an explicit documented boundary. No partial state.
- **Dependencies:** none.

### T44 — Demo campaign hygiene (P3→P2 before any external demo, XS, High)

- **Objective:** demo seed content contains no QA debris ("Visual QA", "hello from command line" chat messages, stray "Steamboat Willie Steamboat Showdown" token naming) and presents a clean first-session tableau.
- **Likely files:** demo seed module in `apps/api` (search `camp_demo` seed), token names, seeded chat.
- **Acceptance criteria:** fresh demo boot shows curated chat (≤5 messages), consistently named tokens, and a short GM journal entry; E2E smoke against demo still passes.
- **Dependencies:** none.

### T45 — Investigate canvas capture cost (P3, S, Low)

- **Objective:** determine why external CDP screenshot capture of the board page timed out (30s) in this audit's in-app browser while DOM/JS stayed responsive, and whether the AI board-capture path (`/agent/board-captures`) is exposed to the same cost on large scenes.
- **Note:** Playwright's own runs screenshot fine; this may be purely an environment artifact — timebox to a day.
- **Acceptance criteria:** a written finding (repro or exoneration) + follow-up ticket only if the board-capture path is affected.
- **Dependencies:** none.

### T48 — Repair the default E2E suite to current product semantics (P1, M, High)

- **Objective:** `pnpm e2e` (default + bootstrap configs) passes at HEAD.
- **Why (evidence, this audit):** a fresh `pnpm e2e` run at `b5e30f1` failed multiple `auth-tabletop.spec.ts` tests (final count in `FEATURE_AUDIT.md`). Three sampled failure classes: (a) **stale pinned copy** — the scene-state-comparison test pins pre-f64c6f2 text ("Selected-only none; active-only…") while the shipped "Prep drift review" comparison renders correctly; (b) **old-semantics expectation** — the combat-tracker test expects "Death saves 3/3 – 1/3" to persist, but T04's intended semantics reset counters on stabilization; (c) **indeterminate early failure in a f64c6f2-added test** — the death-save-from-sheet journey failed at 4.5s on an undefined helper value with a barely-hydrated page snapshot (the same flow passed in this audit's manual live walk, so timing sensitivity is the leading theory — verify, don't assume). The suite was not maintained through the T01–T37 tranche because `pnpm check` doesn't run Playwright, CI failed earlier at the `security:audit` step for the last several pushes, and only the canonical spec was run in isolation.
- **Residual product questions to answer during repair:**
  1. After stabilization the observed combatant row showed failures `1/3` with successes reset to `0/3`; SDK semantics reset both counters. Determine whether the combat-sync path (`app.ts:24255`) diverges from the SDK resolver for manually-patched combatant counters; fix or document.
  2. The f64c6f2-added test "character at 0 HP resolves Death Saving Throws from the sheet to a terminal state" fails **deterministically** on a quiet machine at `auth-tabletop.spec.ts:3976` — the awaited roll response has `resolution.deathSave === undefined` despite `response.ok()`. Leading diagnosis (verified against gating code `dnd-combat-progression.ts:226`, which is sound): the response-waiter predicate `postData().includes("death-save")` also matches the sheet's `commitMode:"preview"` POST that fires when the death-save row first renders, and previews legitimately omit `deathSave` (`applyDnd5eSrdDeathSaveRoll` returns `{}` without a rolled result). The same flow passes in the canonical spec and in a manual live walk. Fix the predicate to require the commit (e.g., match on response body `commitMode":"commit"` or exclude previews) — and if the diagnosis is wrong, treat it as a real T04 regression and escalate.
- **Scope:** update pinned copy/semantics in the failing tests to current intended behavior; do not weaken assertions (pin the new copy exactly); file separate tickets for any failure that turns out to be a real regression.
- **Acceptance criteria:** `pnpm e2e` exits 0 on a quiet machine twice consecutively; every changed expectation references the commit that changed the behavior (f64c6f2 or later); the death-save residual question has a documented answer with a regression test if it was a bug.
- **Dependencies:** none — **do this before or with T38**; the CI release gate cannot go green without it.

### T46 — Sheet/API agreement regression for web-local rules heuristics (P2, S, High)

- **Objective:** a regression test asserts that the presentation heuristics `apps/web/src/actor-sheet-data.ts` re-implements locally (458 `dnd5eSrd*` occurrences — e.g. its own `dnd5eSrdHasSecondWind`, class-feature/monster action options) stay consistent with authoritative server sheet payloads for representative actors.
- **Why:** the web deliberately does not depend on `packages/system-sdk`, so SDK rule changes (like T38's activation metadata) can silently diverge from the web mirror. Server stays authoritative for outcomes, but stale mirrors mislabel buttons and previews.
- **Approach:** extend the existing sheet/API agreement test pattern (`actor-core-statistics.test.tsx` fetch-shape fixtures) with fixtures generated from SDK output for a fighter/barbarian/wizard/monster; assert option ids/labels/economy tags match.
- **Acceptance criteria:** test fails when SDK adds/changes a feature roll the web mirror doesn't reflect (validated by temporarily reverting the T38 metadata).
- **Dependencies:** after T38/T39 (uses their fixtures).

### T47 — X01 session-evidence kit (P1, S, Medium)

- **Objective:** real-table sessions produce structured evidence with near-zero DM overhead: a GM-only "Session report" quick action that appends a tagged journal entry (session id, what broke, what was corrected, recovery used), plus a one-page observation checklist in `docs/dogfood/`.
- **Why:** X01 is the milestone; unstructured impressions won't close it.
- **Likely files:** small web action + journal tag; `docs/dogfood/x01-session-checklist.md`.
- **Acceptance criteria:** one click during play captures a report entry visible only to the GM; checklist covers corrections, conflicts, recovery, privacy, manual-ruling outcomes (mirrors X01's definition).
- **Dependencies:** none; ship before the first X01 session.

## Historical execution order (superseded 2026-07-16)

1. **T48** (repair the default E2E suite — unblocks the CI release gate) and **T38 + T39** (the action-kind seam, P0 correctness). These can ship as two parallel PRs.
2. **T40** (evidence artifacts), then **T41** (fast gate) — hygiene while X01 planning starts.
3. **T47** (session-evidence kit) and **T44** (demo cleanup) before the first real session.
4. Begin **X01 sessions** (the real milestone).
5. **T46** (sheet/API agreement) right after T38 fixtures exist.
6. **T42 / T43** as X01 feedback and licensing checks dictate.
7. **T45** timeboxed whenever convenient.

## External/manual evidence queue (unchanged)

| ID | Required evidence | Release gate |
| --- | --- | --- |
| X01 | Repeated internal and invited GM/player sessions, including abandonment, correction, conflict, staff-repair outcomes | Internal Playable / Private Alpha |
| X02 | Live OIDC/SCIM provider lifecycle, if advertised | Private Alpha |
| X03 | Timestamped, non-no-op hosted state-plus-asset backup, restore, forward migration, rollback | Private Alpha / Public Beta |
| X04 | NVDA, Narrator, VoiceOver, TalkBack, Edge, Firefox, Safari, physical touch-device matrix | Private Alpha / Public Beta |
| X05 | Hosted HTTPS, capacity, proxy, realtime, observability, alert, incident drills | Private Alpha / Public Beta |
| X06 | Approved content inventory, attribution, distribution boundary | Public Beta |
| X07 | Independent security review incl. plugin boundary and adversarial AI | Public Beta |
| X08 | Representative AI quality/provider-handling evaluation, if AI is offered | Public Beta |

## Pull-request quality bar (unchanged)

- Permission-checked, exact-revision, idempotent mutations where replay is possible.
- Server behavior authoritative; UI checks are usability.
- Smallest failing regression per fix; compatibility labeled with deprecation windows.
- No hosted/device/legal/security/AI-quality claims from local tests.
- No broadening of manual geometry/prose boundaries into guessed automation.

## Definition of complete

A **code ticket** is complete when its authoritative path, connected surface (where required), permissions, persistence/recovery behavior, and focused regression coverage are present — and, from T40 onward, when the fresh-gate evidence artifact for its landing run is persisted.

A **release stage** is complete only when every applicable X-item is recorded in addition to fresh local validation.
