# Product Roadmap

## 2026-07-17 remediation-complete roadmap (authoritative)

This roadmap supersedes conflicting 2026-07-16 sequencing. N01-N20 and the code-addressable T38-T48 follow-ups are implemented in the current uncommitted tree. The next milestone is no longer feature remediation; it is **Alpha Evidence and Release Qualification**.

### First milestone: Alpha Evidence and Release Qualification

**Outcome:** a clean, reproducible candidate that has survived real GM/player use and an independent hosted recovery drill, with every discovered blocker returned through the same typed, permission-checked implementation and regression process.

**Exit:** final local aggregate/browser gates are green; X01 includes at least three observed sessions with correction/conflict/recovery notes; X03 restores non-empty state and assets into a clean environment; no unresolved Critical/High defect from those exercises remains.

**Current status:** the RQ01 local prerequisite is complete as of 2026-07-17. The milestone remains open for RQ02-RQ10, especially X01 real-table evidence and X03 independent hosted recovery.

### Ordered next ten work items

| Order | Work item | Exit evidence |
|---:|---|---|
| 1 | RQ01 final local qualification - **complete locally 2026-07-17** | `pnpm check`, default 62/62 plus bootstrap 1/1, canonical restart 1/1, full Level 3 combat 1/1, docs check, and diff hygiene are green on the exact working tree. |
| 2 | RQ02 independent quickstart | A person other than the implementer reaches a healthy table from the documented Compose path. |
| 3 | RQ03 X01 session one | GM/player setup, correction, conflict, privacy, and recovery observations captured. |
| 4 | RQ04 X01 sessions two and three | Repeated evidence plus abandonment and recurring-campaign observations captured. |
| 5 | RQ05 session findings closure | Every code defect gets a regression; product choices are recorded rather than hidden as bugs. |
| 6 | RQ06 X03 hosted recovery | Timestamped non-no-op state-plus-asset backup, clean restore, forward migration, and rollback. |
| 7 | RQ07 X05 operating envelope | HTTPS/proxy/capacity/realtime/alerts/incident drill on the selected topology. |
| 8 | RQ08 X04 physical access matrix | Named screen-reader, browser, keyboard, and touch tasks completed on physical devices. |
| 9 | RQ09 X06 and X07 approvals | Content inventory/legal approval and independent security review with no unaccepted Critical/High issue. |
| 10 | RQ10 X08 AI qualification | Required only if AI is offered: representative provider, quality, privacy, failure, and adversarial evaluation. |

### What not to build yet

No voice/video, social network, hostile third-party marketplace, universal automation engine, hex-grid parity, HA/multi-region topology, microservice rewrite, or additional AI surface belongs ahead of RQ02-RQ10. The product needs evidence and table feedback, not another breadth tranche.

## 2026-07-16 roadmap addendum (authoritative)

The historical roadmap below assumed the code-addressable audit backlog was nearly exhausted. Current evidence disproves that assumption. This roadmap replaces that conclusion while preserving prior ticket history. Sequence is driven by player trust and complete workflows, not by feature novelty.

### North-star release story

A new DM and one player can create or resume legal level-3 characters, prepare a map, invite the player, complete a two-hour combat-and-exploration session, reconnect safely, undo a mistake, and restore the campaign on a documented self-host installation without developer intervention or contradictory state.

### Target product stages

#### Foundation

- **Target user:** maintainers and test operators.
- **Required workflow:** every mutation in the core loop is authorized, typed, transactional, replay-safe, undoable where promised, and recoverable after reconnect.
- **Required D&D capability:** authoritative rolls, HP/temp HP, defeat/recovery, actions/reactions/resources, conditions/concentration, character provenance, and campaign persistence.
- **Non-goals:** polished breadth, every spell, hosted scale, marketplace, or AI expansion.
- **Reliability / rules / data loss:** no known wrong authoritative transition in the M0 attack/damage/HP/defeat/recovery/movement loop; deterministic focused and aggregate gates; zero tolerated committed-state loss. R-10/R-12/R-13 remain explicit M1 work.
- **Security / migration / docs:** explicit permission tests, additive compatibility fixtures, current limitations and local recovery instructions.
- **Exit / metrics:** close N01-N05; canonical journey 10/10; two cold aggregate passes; zero open Critical state-integrity finding.

#### Internal playable build

- **Target user:** the development team and one technically comfortable DM/player group.
- **Required workflow:** create campaign and characters, prepare one scene/encounter, invite, run combat/exploration, persist, reconnect, undo, and resume.
- **Required D&D capability:** legal level-1 creation and representative level-3 play, common spell/resource use, rests, advancement, conditions, concentration, and clearly labeled manual adjudication.
- **Non-goals:** unassisted install, broad device support, full spell automation, or public security posture.
- **Reliability / rules / data loss:** no manual database repair; no contradictory actor/combat state; manual rulings are visible rather than silently automated.
- **Security / migration / docs:** server permissions remain mandatory; local archive round trip and developer runbook work.
- **Exit / metrics:** complete M0 and M1, then run one two-hour internal session with no severity-1 state divergence, no lost draft, and a successful reconnect/resume.

#### Private alpha

- **Target user:** a small invited cohort of DMs and players running persistent campaigns on documented self-host or managed infrastructure.
- **Required workflow:** independent install/join, repeated sessions, character advancement, campaign search, backup/restore, and support-diagnostic collection.
- **Required D&D capability:** all SRD classes playable through the supported level range; correct spell grant/ability attribution; common combat rules correct; automation boundaries published.
- **Non-goals:** anonymous signup, hostile plugins, proprietary content, high availability, or every device.
- **Reliability / rules / data loss:** no known Critical/High rules-integrity defect; committed-state loss is unacceptable; restore point and rollback behavior are published.
- **Security / migration / docs:** close self-host configuration, AI-lock, scanner-policy, and selected realtime risks; versioned migrations, upgrade/restore runbooks, known limitations.
- **Exit / metrics:** three recurring external sessions; independent install, upgrade, reconnect, and clean restore; no unresolved High campaign-data/rules blocker.

#### Public beta

- **Target user:** external DMs and players who do not know the repository and may use untrusted networks/devices.
- **Required workflow:** unassisted onboarding, responsive/keyboard-complete core play, campaign-scale search/paging, account recovery, upgrade, and support.
- **Required D&D capability:** the advertised SRD support matrix is accurate and test-backed; manual versus automatic resolution is visible.
- **Non-goals:** feature parity with every VTT, universal rules scripting, voice/video, or hostile marketplace.
- **Reliability / rules / data loss:** hosted SLOs, incident process, migration telemetry, capacity/recovery evidence, and no unaccepted Critical/High rules defect.
- **Security / migration / docs:** cookie/session transport, CSP, revocation, proxy/account throttling, supply-chain pinning, independent security/accessibility review, privacy and limitations docs.
- **Exit / metrics:** security/accessibility findings closed or explicitly accepted below High; beta cohort completes sessions and restores within published targets; support volume is diagnosable.

#### Version 1.0

- **Target user:** the clearly positioned audience of technically comfortable, ownership-focused D&D 5.5e groups plus supported operators.
- **Required workflow:** sustained creation, preparation, play, advancement, campaign knowledge, portability, upgrades, and recovery across supported releases.
- **Required D&D capability:** stable advertised compatibility and support boundaries, not universal automation.
- **Non-goals:** breadth for its own sake, multi-system redesign, or infrastructure whose need has not appeared in operation.
- **Reliability / rules / data loss:** sustained beta reliability/retention, supported rollback windows, no unresolved release-blocking correctness or security finding.
- **Security / migration / docs:** published compatibility policy, deprecation window, operator/user documentation, incident and vulnerability process.
- **Exit / metrics:** multiple successful upgrade cohorts, stable recurring-session completion and restore rates, demonstrated accessibility, and supportable operations over a full release cycle.


### Authoritative priority definitions

| Priority | Current scope | Why now |
|---|---|---|
| P0 | N01 critical damage; N02 recovery projection; N03 continuation determinism; N04 atomic group move; N05 aggregate-gate stability; N06 AI mutation lock when AI is enabled; N07 self-host/backup repair when self-host alpha is targeted | Without these, real play or release evidence can be wrong, partial, frozen, or unrecoverable. |
| P1 | N08-N15 plus N19: combat-panel speed, resumable creation, standard array, class-complete spell attribution, movement/subclass fixes, onboarding, paging/show-all, and realtime contract/sequence parity | Required for a convincing internal/private-alpha session loop. |
| P2 | N16-N18 and N20: handout/chat depth, cookie/CSP/rate/egress/supply-chain hardening, accessibility, recurring-campaign evidence, and selected managed effects | Required for public beta trust or meaningful differentiation. |
| P3 | Broader campaign-scale refinements, lower-frequency rules depth, and supported SDK examples beyond the selected N20 effect lifecycle | Valuable after the core loop and public trust are proven. |
| Not now | HA/multi-region, microservices, universal rules DSL, hostile marketplace, voice/video, 3D/cosmetic parity, proprietary content, more AI surface | Attractive distractions that do not close the current D&D campaign loop. |


### Milestone sequence

| Milestone | Target outcome | Complete workflows | Rules investment | Reliability / data loss | Security / operations | Migration / docs | Exit evidence |
|---|---|---|---|---|---|---|---|
| M0 - Deterministic core loop | The current build becomes a Foundation/internal-playtest candidate | Attack -> damage -> HP -> defeat/recovery; atomic group movement; canonical journey | Critical outcome; actor/combatant life-state projection | Remove canonical flake; make aggregate API suite bounded and diagnosable | Shorten AI mutation critical sections or disable AI in alpha profile | Document working-tree tranche and compatibility notes | Critical and recovery matrices pass; canonical journey 10/10; aggregate gate green twice from cold state |
| M1 - Session-speed combat and character integrity | A DM and player can run ordinary level-3 play without leaving the primary surfaces | Combat HP/temp HP, roster changes, resumable creator, complete sheet lists, one guided map setup | Ability allocation; class-complete spell grant attribution; movement bonuses; subclass gating | Draft recovery; reconnect assertions around active combat | Permission-aware batch commands and explicit denial UX | Schema/API changes are additive with archive round-trip fixtures | Moderated first-session test completes with no developer intervention and no severity-1 state divergence |
| M2 - Recurring campaign evidence | The same group can play repeatedly and trust campaign continuity | Journals/handouts, search/paging, whisper flow, advancement between sessions, archive restore | Selected persistent effects and common class features based on observed play | Multi-session soak; restore drill; asset/database pairing; migration rehearsal | Realtime sequence coverage for AI/agent events; OpenAPI/revision guard parity | Operator runbook, restore runbook, compatibility matrix, sample campaign | Three recurring sessions, restore proof, reconnect proof, no unresolved high-severity campaign-data defect |
| M3 - Private self-hosted alpha | A small invited cohort can install, operate, upgrade, and recover | Complete Docker quickstart and admin/backup workflows | Rules gaps are labeled and manual adjudication remains first-class | Scheduled backup proof, upgrade/rollback rehearsal, bounded observability | Fix Compose storage/secret wiring; account-aware login throttling; scanner outbound policy | Versioned release notes, migrations, admin checklist, support intake | Independent install succeeds; restore and upgrade evidence; supportable failure diagnostics |
| M4 - Public beta trust | Untrusted users can use the product without avoidable security or accessibility hazards | Responsive onboarding, keyboard-complete core board tasks, polished handouts/chat management | Depth from playtest evidence, not catalog vanity | Hosted SLOs, incident process, load evidence, migration telemetry | Cookie session transport, CSP, token migration/revocation, proxy-aware rate limiting, dependency/image pinning | Privacy/security docs, accessibility statement, public known-limitations page | Security review, accessibility audit, load/recovery evidence, hosted beta cohort metrics |

### Milestone prerequisites and risks

| Milestone | Prerequisites | Technical risks | D&D rules risks |
|---|---|---|---|
| M0 | Current dirty rules/E2E tranche is inventoried; focused fixtures can run from clean state | Preview/realtime race, partial batch writes, global durable lock, shared test resources and worker teardown | Critical dice, zero-HP recovery, and action/resource regressions in the core combat-state loop |
| M1 | M0 state transitions and gates are stable; shared creation/advancement types are available | Draft/version migration, duplicated client derivation, list/paging contract compatibility, session-panel state churn | Legal ability assignment, spell grant source/casting ability, speed prerequisites, and subclass ownership |
| M2 | M0+M1 complete; a recurring group and campaign-scale fixtures are available | Journal/handout draft recovery, search/paging scale, realtime sequence gaps, archive DB/assets pairing | Persistent effect duration/stacking, advancement between sessions, and honest manual adjudication boundaries |
| M3 | M0+M1 product loop is stable; M2 recovery evidence and an independent operator/environment are available | Storage/TLS/secret mismatch, backup scheduler wiring, upgrade/rollback, proxy and scanner egress configuration | Advertised class/spell support must match the tested matrix; manual effects must not be presented as automatic |
| M4 | M3 independent install/restore succeeds; external security/accessibility reviewers and hosted telemetry exist | Session-token migration, CSP compatibility, rate-limit rollout, capacity/incident operations, device/AT coverage | Public rules claims, content provenance, and migration must not silently change authoritative character/campaign state |

N07 is a global P0 only when private self-hosted alpha is in scope. It may be implemented in parallel during M0, but its acceptance is an **M3 exit gate**, not evidence that M0 is a self-host release.


### M0 - Deterministic core loop

**Objective:** restore one authoritative answer for every state in the primary combat loop and make the release gate trustworthy.

Deliver:

1. Persist the attack's critical outcome and apply critical dice correctly, including expanded ranges and negation.
2. Synchronize actor and combatant recovery bidirectionally within the same durable mutation.
3. Replace independent group-token writes with one permission-checked batch command and transaction.
4. Diagnose and remove the disabled damage-continuation race in the canonical journey.
5. Keep streamed AI provider work outside the global durable mutation critical section; preserve automatic, permission-checked execution.
6. Make the full API test suite bounded, isolate shared-state/worker failures, and retain artifacts for timeouts.
7. Treat the uncommitted Second Wind, Tactical Mind, spell advancement, and full-combat work as unreleased until the aggregate evidence is green.

**Non-goals:** new classes, more spells, UI restyling, universal effect engine, new AI features.

**Exit criteria:**

- critical matrices cover weapon, spell attack, Sneak Attack, Champion ranges, and critical negation;
- healing/recovery matrices cover active combat, undo, reconnect, and damage back to 0;
- mixed-authority group movement is all-or-nothing;
- canonical public journey passes ten consecutive clean runs;
- full level-3 journey passes from a cold environment;
- `pnpm check`, fast gate, evidence gate, and relevant E2E gates all pass with bounded runtimes.

### M1 - Session-speed combat and character integrity

**Objective:** remove the highest-friction panel switching, hidden data, and lost character work.

Deliver:

- HP, damage, healing, temporary HP, add/remove combatant, and clear turn context in the combat panel;
- autosaved/resumable character-creator drafts with an explicit discard action;
- standard-array assignment with authoritative preview and provenance;
- class-complete SRD spell acquisition metadata and correct multiclass casting ability;
- effective-speed derivation for class bonuses and prerequisites;
- selected-subclass gating for Open Hand and similar grants;
- "show all"/paging for loadout, action, feature, actor-placement, and invite lists;
- a single map setup path from upload through selection, grid calibration, and a correctly computed onboarding-ready state;
- error messages that identify the rejected token/action and leave no partial state.

**Integration requirements:** reuse shared core/System SDK types; add typed commands and permission checks; keep archive compatibility fixtures; do not mutate storage from plugins.

**Exit criteria:** a first-time DM/player usability session completes character creation, map setup, invite, and combat without data loss, hidden required controls, developer assistance, or a high-severity rules correction.

### M2 - Recurring campaign evidence

**Objective:** prove continuity across sessions rather than accumulating more isolated features.

Deliver:

- persistent draft handling for journals and a rendered Markdown/media handout player;
- search, paging, and stable scroll behavior for campaign-scale lists and chat;
- explicit direct-message/whisper semantics or a documented decision not to support them;
- advancement flow verified between sessions for every SRD spellcasting class;
- small managed-effect primitives for the most common repeated effects observed in playtests;
- campaign sequence/reconnect parity for AI and agent events;
- archive restore drills that pair database and assets;
- migration fixtures from the prior supported release and one rollback rehearsal.

**Exit criteria:** one external group completes three sessions, including advancement, reconnect, archive export/restore, and a facilitator-recorded usability review; no open data-loss or rules-integrity blocker remains.

### M3 - Private self-hosted alpha

**Objective:** make installation and operation boring for invited technical operators.

Deliver:

- one verified Compose profile whose S3 endpoint, TLS policy, signing secret, health checks, and production validation agree;
- backup scheduler variables passed through and surfaced in health/admin status;
- database-plus-assets backup/restore runbook and automated restore verification;
- account-aware and proxy-aware authentication throttling;
- pinned container/dependency versions and broader dependency-update coverage;
- scanner egress rules aligned with webhook SSRF defenses;
- upgrade, rollback, diagnostics, and support collection documentation.

**Exit criteria:** an independent operator installs from the public instructions, upgrades once, restores a backup into a clean environment, and can provide actionable diagnostics without repository knowledge.

### M4 - Public beta trust

**Objective:** support untrusted users and broader devices without expanding the product promise.

Deliver:

- move browser auth from long-lived localStorage bearer tokens to hardened cookie/session transport with revocation and migration;
- ship an explicit CSP and review all asset/plugin execution surfaces;
- keyboard-complete token movement, measurement, drawing, and fog operations plus responsive core workflows;
- hosted observability, incident response, capacity evidence, and privacy/security documentation;
- public limitations that distinguish automated SRD mechanics from DM-adjudicated effects.

**Exit criteria:** independent security and accessibility reviews close all critical/high findings; hosted load/recovery targets pass; beta retention and session-completion metrics justify further rules depth.

### Explicitly not now

- high availability, multi-region replication, or microservice extraction;
- a universal D&D rules or spell scripting language;
- a hostile third-party plugin marketplace;
- voice/video, 3D maps, or animation-heavy presentation;
- bundling proprietary non-SRD content;
- automating every spell, summon, illusion, and social rule;
- expanding AI surface area or changing automatic execution into proposal-only behavior;
- wholesale rewrites of the System SDK, API composition root, or web shell.

### Roadmap metrics

Track a small product scorecard per release: median time to first playable scene; character-creation completion and draft recovery; combat actions requiring panel switches; canonical clean-run pass rate; unexpected actor/combat divergence; reconnect recovery; archive restore success; independent install success; accessibility task completion; and number of rules interactions that require an undocumented workaround.


> **Historical material below is retained for traceability only.** Its “complete” stage labels, T38-only priority model, calendar estimate, dependency order, and claim that only external evidence remains are superseded by the 2026-07-16 addendum.

> Re-issued 2026-07-15 at committed HEAD `b5e30f1`. The T01–T37 code tranche is committed and independently re-verified (see `FEATURE_AUDIT.md`). The roadmap ahead is deliberately small in code and large in evidence: a short correctness/hygiene tranche (T38–T45), then the external/manual evidence ladder X01–X08. No hidden implementation backlog remains from the audit.

## Product principles

1. Trustworthy shared state over feature count.
2. The API is authoritative for permissions, revisions, idempotency, and rules mutations; UI checks are usability only.
3. Player-facing outcomes must be visible, reviewable, and recoverable.
4. Never guess geometry, unsupported prose, or a DM ruling; label manual steps.
5. Preserve unknown legacy/homebrew data outside managed typed roots.
6. Keep the AI contract: optional, policy-governed, manual review plus governed automatic execution through the same permissioned transactions.
7. Local code completion, fresh local validation, and hosted/human evidence are three different gates; never let prose substitute for the freshest one.

## Target audience and promise

A DM running a recurring small-group D&D 5.5e campaign, with players who need a dependable sheet, shared tabletop, reviewed rules outcomes, and durable continuity. The promise is a coherent session loop with explicit support boundaries and recoverable authoritative state — not universal automation.

## Current position (verified)

- All P0/P1/P2 audit tickets T01–T37: committed.
- Fresh canonical blank-deployment journey: **passed 1/1 (1.3m)** this session.
- Fresh forced aggregate gate: failed once on a mid-audit gate break (repaired within minutes, identical fix committed as `b5e30f1`), re-run green pending final record in `FEATURE_AUDIT.md`.
- Live browser walk of the demo campaign: core DM/player loop works; found R-04/R-05 (action-kind classification for two Fighter features) — now tickets T38/T39.
- X01–X08: all open.

## Stage gates

### 1. Trustworthy Foundation — **complete (re-verified)**

Authoritative class levels, exact monster bonuses, action economy, overrides, atomic death saves, archive identity binding, resumable placement, save Advantage, Mastery, Rage, AC intent, bounded test concurrency, module budgets. Exit evidence: fresh forced root runs + canonical journey (this session), recorded in `FEATURE_AUDIT.md`.

### 2. Historical correctness and hygiene tranche (T38-T45) - **superseded**

The only code milestone ahead of real-table work.

- **P0:** T38 Second Wind Bonus-Action fix.
- **P1:** T48 default E2E suite repair (unblocks the CI release gate); T39 Tactical Mind classification; T40 persisted release-evidence artifacts; T41 gate-drift guard; T47 X01 session-evidence kit.
- **P2:** T42 legendary-action economy; T43 species-coverage decision; T44 demo-content hygiene; T46 sheet/API agreement regression.
- **P3:** T45 canvas capture investigation.

Exit criteria: T38/T39/T48 landed with regressions; **GitHub Release Smoke green on main**; one fresh `TURBO_FORCE=true pnpm check` + canonical journey green with artifacts persisted per T40; demo campaign presentable.

### 3. Internal Playable Campaign — evidence stage (X01 begins)

Run the team's own recurring 5.5e sessions on a self-hosted deployment.

- Required workflows: full core loop (create campaign → characters → scene/encounter → invite → combat → persist → resume) with zero database repairs.
- Required D&D capabilities: SRD character play levels 1–5 minimum, combat with conditions/concentration/death saves, rests, advancement.
- Non-goals: new feature breadth; non-SRD content; HA.
- Reliability: no data loss; conflicts recover through the reviewed paths.
- Exit: ≥3 real sessions with observed correction/conflict/recovery outcomes logged against X01; blockers filed and fixed.

### 4. Private Alpha Operations

Invited DMs/players, persistent campaigns, hosted deployment.

- Exit evidence: X01 sustained at alpha scale; X02 if identity is advertised; X03 hosted state-plus-asset restore/migration/rollback (non-no-op); X04 physical AT/device matrix; X05 HTTPS/capacity/proxy/realtime/alerts/incident drill.
- Data-loss tolerance: none for committed state; published restore point objectives.

### 5. Public Beta Trust

- Exit evidence: X01–X05 healthy; X06 content/legal inventory approval; X07 independent security review (no unaccepted Critical/High); X08 AI quality/provider evaluation if AI is offered.
- Documentation: published operating limits, support boundaries, upgrade/restore runbooks.

### 6. Version 1.0

Sustained beta operation with stable retention/recovery, demonstrated accessibility, resolved external findings, and a supportable release/upgrade process. Not a breadth push.

## Priorities

| Priority | Meaning | Contents |
| --- | --- | --- |
| P0 | Core play produces a wrong authoritative state without it | T38 |
| P1 | Required for a convincing internal-playable/alpha claim | T39, T40, T41, then X01 |
| P2 | Important for beta or meaningful differentiation | T42, T43, T44, X02–X05 |
| P3 | Valuable later | T45, X06–X08 sequencing docs |
| Not now | Explicitly deferred | See below |

## Dependencies

- T38/T39 share one seam (action-kind classification) — one PR.
- T40 feeds T41 and every later stage's exit records.
- X01 depends on stage-2 exit; X03/X05 depend on choosing the hosted topology; X06–X08 gate public beta only.

## Deferred work ("not now")

- Microservices, multi-region, HA topology.
- Universal rules DSL; actor-schema rewrite; further monolith extraction beyond touched domains.
- Hostile-plugin marketplace; broad social features; voice/video.
- Procedural generation; cosmetic systems; marketplaces.
- Non-SRD content integrations without licensing.
- Advanced visual effects; automated cover/line-of-sight/pathfinding.
- More AI surface ahead of X07/X08.

## Success metrics

| Stage | Metric |
| --- | --- |
| Correctness tranche | Fresh forced root run + canonical journey green with persisted artifacts; R-04 counterexample fails on old code, passes on new |
| Internal Playable | ≥3 real sessions, zero database repairs, all corrections through reviewed paths |
| Private Alpha | Hosted restore drill restores state+assets byte-consistently; alert drill pages a human; AT matrix has no unfixed blocker |
| Public Beta | Zero unaccepted Critical/High external findings; content inventory approved |
| 1.0 | Sustained sessions and upgrades within published support/capacity/recovery boundaries |
