# Product Roadmap

> Current-state roadmap, 2026-07-16. The audited code tranche T01-T37 is implemented across committed HEAD `e4c6ac9` and the validated working tree. The frozen local aggregate/canonical gates passed. The next work is external/manual evidence X01-X08, not another hidden implementation backlog.

## Product principles

1. Trustworthy shared state matters more than feature count.
2. The API remains authoritative for permissions, revisions, idempotency and rules mutations.
3. Player-facing outcomes must be visible, reviewable and recoverable.
4. Do not guess geometry, unsupported prose or a DM ruling.
5. Preserve unknown legacy/homebrew data outside managed typed roots.
6. Keep the current AI contract: optional campaign/deployment controls, manual review and governed automatic execution through the same permissioned transactions.
7. Treat local code completion, frozen-tree validation and hosted/human evidence as different gates.

## Target audience and promise

The primary audience is a DM running a recurring small-group D&D 5.5e campaign with players who need a dependable sheet, shared tabletop, reviewed rules outcomes and durable campaign continuity. The promise is not universal automation. It is a coherent session loop with explicit support boundaries and recoverable authoritative state.

## Current position

The audit implementation tranche is **code-complete and locally accepted in the working tree**:

- all P0 correctness and recovery tickets are implemented;
- player, campaign-administration, gridless, setup, search, duplication, streaming and consequence-review surfaces are connected;
- operational retention, observability, session-transport and coordinated-backup controls exist;
- typed managed D&D subroots were introduced incrementally without discarding legacy/homebrew fields;
- the web has behavior-preserving lazy boundaries;
- all eight Weapon Mastery properties are represented, with Push intentionally requiring reviewed manual geometry.

This is not yet a release-readiness claim. The final frozen-tree canonical run and three consecutive aggregate checks passed, but X01-X08 still require real users, providers, devices, hosted infrastructure or independent reviewers.

## Stage gates

### 1. Trustworthy Foundation

**Implementation state:** complete and locally accepted.

Required code outcomes now present:

- authoritative class-level semantics, exact monster bonuses, Action/Action Surge economy and calculation overrides;
- atomic Death Saves, archive identity binding and encounter placement;
- actual save Advantage, Weapon Mastery review, Rage lifecycle and explicit Armor Class intent;
- bounded test concurrency and enforced module budgets.

Recorded local exit evidence:

- three consecutive forced root checks on one frozen implementation/test tree; each passed lint 25/25, typecheck 25/25, E2E typecheck, tests 25/25 with 303 files, 1,822 passing tests and 1 skipped test, and builds 15/15;
- final physical-line and production-bundle records are captured in the implementation ledger and architecture register.

### 2. Internal Playable Campaign

**Implementation state:** complete and locally accepted; real-table evidence pending.

Required code outcomes now present:

- resumable first-session setup, campaign member administration and square/gridless scenes;
- Heroic Inspiration, reviewed consequences, exact search/action navigation and advancement retry;
- dedicated campaign duplication, streamed archives and reload-resumable controlled-creature handoff with current-authority rechecks;
- a public-UI canonical blank-campaign journey.

Exit evidence:

- T08 local acceptance completed: the isolated canonical Playwright journey passed 1/1 in 1.4 minutes against frozen snapshot `20260716T030254960Z`;
- repeated invited GM/player sessions and correction/conflict outcomes (X01).

### 3. Private Alpha Operations

**Implementation state:** repository controls complete; deployment evidence pending.

Required code outcomes now present:

- coordinated state-and-asset backup orchestration and schedules;
- retention preview/apply controls;
- conflict, reconnect, write-latency, backup/restore and manual-rules observability;
- header/subprotocol-first session transport with compatible URL-token deprecation.

Exit evidence still needed:

- live OIDC/SCIM if offered (X02);
- hosted state-plus-asset backup/restore/migration/rollback (X03);
- physical accessibility/browser/device matrix (X04);
- hosted HTTPS/capacity/proxy/realtime/alerts/incident drill (X05).

### 4. Public Beta Trust

**Implementation state:** blocked on independent/manual evidence.

Exit evidence:

- X01-X05 remain healthy at alpha scale;
- content inventory and legal approval (X06);
- independent security review (X07);
- representative AI quality and provider-handling evaluation if AI is offered (X08).

### 5. Version 1.0

Version 1.0 follows sustained beta operation, not another breadth push. Promotion requires stable retention/recovery, published operating limits, demonstrated accessibility, resolved Critical/High external findings and a supportable release/upgrade process.

## Completed code roadmap

| Theme | Tickets | Outcome |
| --- | --- | --- |
| Baseline correctness | T01-T06 | Slot rounding, typed defenses, monster zero-HP, Death Saves, core rolls and safe combat conflict recovery are connected |
| Playable session UX | T08-T12, T20, T31, T34-T35 | Canonical journey, Inspiration, people management, gridless scenes, resumable setup, support labels, structured review, exact search and advancement recovery |
| Architecture and operations | T07, T13-T19 | Stable validation configuration, lazy boundaries, safer session transport, coordinated backups, retention, typed subroots, observability and evidence gating |
| Rules trust | T21-T24, T27-T30, T36 | Class levels, exact monster rolls, Action economy, effective overrides, save Advantage, Mastery, Rage, Armor Class intent and truthfully scoped recorded-roll replay |
| Atomic/recoverable workflows | T25-T26, T32-T33, T37 | Identity-bound archive recovery, resumable encounter placement, dedicated duplication, streamed archives and source-locked reload-resumable controlled-creature handoff |

The former "first ten" list is retained only as historical sequencing in audit history. It no longer describes open scope.

## Evidence roadmap

| Order | Evidence item | Status/purpose |
| --- | --- | --- |
| 1 | Final frozen-tree root validation | Complete; establishes the repeatable local code/build baseline |
| 2 | Final frozen canonical public-UI journey | Complete; proves the implemented core loop without changing the test during execution |
| 3 | X01 repeated real-table sessions | Open; finds workflow and recovery failures automation does not model |
| 4 | X03 hosted state-plus-asset drill and X05 operating drill | Open; proves recoverability and the supported deployment envelope |
| 5 | X04 accessibility/device matrix | Open; verifies actual assistive technology and physical interaction |
| 6 | X02 provider lifecycle, if advertised | Open; makes identity/provisioning claims provider-specific and real |
| 7 | X06-X08 independent trust review | Open; gates public distribution, security and any offered AI capability |

## External/manual evidence queue

- **X01:** repeated internal and invited GM/player sessions, including abandonment, correction, conflict and staff-repair outcomes.
- **X02:** live OIDC/SCIM against selected providers, if advertised.
- **X03:** hosted state-plus-asset backup, non-no-op restore, forward migration and rollback.
- **X04:** NVDA, Narrator, VoiceOver, TalkBack, Edge, Firefox, Safari and physical touch-device matrix.
- **X05:** hosted HTTPS, capacity, proxy, realtime, observability, alert and incident drills.
- **X06:** release-owner/legal content inventory, attribution and distribution-boundary approval.
- **X07:** independent security review covering auth/session/lockout/proxy behavior, plugin boundaries and adversarial AI privacy/prompt/tool cases.
- **X08:** if AI is offered, representative evaluation of citation accuracy, rules-versus-homebrew distinction, retrieval usefulness, provider retention/training settings and user-facing data/tool disclosure.

## Product scope after this tranche

### Keep investing in

- dependable small-group campaign continuity;
- reviewed 5.5e automation with explicit manual boundaries;
- fast recovery from conflict, interruption and operator error;
- DM/player clarity rather than more configuration density;
- documented API/plugin reuse within the trusted-admin extension model.

### Not now

- microservices or multi-region active/active topology without measured demand;
- hostile third-party plugin marketplace claims;
- guessed pathfinding, line of effect, cover or arbitrary prose resolution;
- proprietary non-SRD content without independent rights;
- broad schema or universal rules-language rewrites;
- more feature breadth before the evidence roadmap closes.

## Success metrics

| Stage | Metric |
| --- | --- |
| Foundation | Repeated green frozen-tree aggregate checks; no known P0 counterexample; enforced module budgets pass |
| Internal Playable | Canonical journey passes; real groups complete setup, play, correction and resume without database repair |
| Private Alpha | Hosted recovery succeeds with state and assets; alert/incident drill works; accessibility blockers are fixed or explicitly tracked |
| Public Beta | Independent legal/security/AI evidence is complete and no unaccepted Critical/High finding remains |
| 1.0 | Sustained sessions and upgrades remain within published support, capacity and recovery boundaries |
