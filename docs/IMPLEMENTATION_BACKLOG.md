# Implementation Backlog

> Current-state ledger, 2026-07-16. The baseline is committed HEAD `e4c6ac9f666793e3a0dba7bcfcca3e2a71e74f9e` plus the validated implementation working tree. T01-T03 and T05-T06 are landed at the baseline; every code-addressable ticket T04 and T07-T37 is implemented in the working tree. The final frozen-tree aggregate and canonical acceptance gates passed. External/manual items X01-X08 remain open.

## Status meanings

| Status | Meaning |
| --- | --- |
| Landed | Present at committed baseline `e4c6ac9` |
| Implemented | Code, connected surface and focused regression coverage exist in the working tree |
| Locally validated | Code is complete and the named frozen-tree local proof is recorded |
| External/manual | Cannot be closed by repository changes alone |

## Shared constraints

- Preserve exact revisions, idempotency, authorization, audit history and permission-filtered realtime behavior.
- Prefer shared domain types from `packages/core` and typed commands over raw storage mutation.
- Preserve legacy and homebrew data outside managed typed D&D subroots.
- Keep geometry- or prose-dependent rulings explicit instead of guessing.
- Preserve both manual AI review and campaign-governed automatic execution. No ticket converts automatic execution to proposal-only behavior.
- Treat the old "first ten" list as sequencing history only; it is not a scope limit.
- A code ticket can be complete while a release stage remains blocked by X01-X08.

## Code ticket closeout ledger

| Ticket | Priority | Status | Implemented outcome |
| --- | --- | --- | --- |
| T01 | P0 | Landed | Half-caster multiclass slot composition uses the supported odd-level round-up behavior with regressions. |
| T02 | P0 | Landed | Resistance and Vulnerability resolve as ordered typed-damage stages. |
| T03 | P0 | Landed | Monsters default to dead at 0 HP, with an explicit knockout exception. |
| T04 | P0 | Implemented | Death Saving Throws atomically handle success/failure counters, natural 1/20, stabilization/death, healing-at-zero and actor/combat synchronization. Stable state clears both counters. |
| T05 | P0 | Landed | The canonical sheet exposes ability, save, skill, initiative, speed, passive-score and quick-roll coverage. |
| T06 | P0 | Landed | Combat round advance retries only one semantically unchanged stale position; all unsafe conflicts require review. |
| T07 | P0 | Locally validated | The supported aggregate validation path uses bounded, isolated test workers. Three consecutive forced root checks passed on the frozen implementation/test tree. |
| T08 | P0 | Locally validated | A public-UI canonical blank-campaign journey covers bootstrap, invite/join, legal character setup, public/private rolls, checks, saves, structured consequence cancel/commit, healing, combat and rest/resume. The final isolated run passed 1/1. |
| T09 | P1 | Implemented | Heroic Inspiration has visible state plus permission-checked grant, transfer, spend and reroll behavior with audit/roll-history feedback. |
| T10 | P1 | Implemented | Manage > People lists campaign members and supports exact-revision, idempotent role changes/removal with owner, self-lockout, SCIM and permission guards. Removed users lose campaign snapshot access. |
| T11 | P1 | Implemented | Scene create/edit exposes square and gridless modes, suppresses square-only controls/calibration for gridless scenes, persists mode and supports unsnapped gridless token movement. |
| T12 | P1 | Implemented | Ordered first-session setup replaces the mega-form with versioned, safe-whitelisted, user/organization/campaign-scoped resumable drafts and authoritative completion state. Player-specific next steps remain role-aware. |
| T13 | P1 | Implemented | Heavy web panels and image generation are demand-loaded with loading/error/retry behavior; touched rules domains were extracted without raising architecture budgets. |
| T14 | P2 | Implemented | Session transport prefers headers/subprotocols, retains a bounded compatible URL-token deprecation path, redacts sensitive transport data and covers revocation. |
| T15 | P2 | Implemented; X03 pending | State and asset backup coordination, manifests, scheduling hooks, retention, recovery UI and operator runbooks are implemented. Provider-native hosted snapshot/restore/migration proof remains X03. |
| T16 | P2 | Implemented | Permissioned retention preview/apply operations prune measured audit, operational and history classes with dry-run and observability coverage. |
| T17 | P2 | Implemented | Versioned typed managed D&D actor/item views validate touched API/archive boundaries while preserving unknown legacy/homebrew fields losslessly. |
| T18 | P2 | Implemented | Operations metrics expose conflicts, reconnects, write latency, backup/restore and manual-rules fallbacks with admin-facing guidance. Hosted alert/incident proof remains X05. |
| T19 | P1 | Implemented | Audit/release claims are gated on fresh machine-readable evidence so stale prose cannot promote a build. |
| T20 | P1 | Implemented | Runtime review distinguishes supported automation, reviewed manual consequences and unsupported behavior; supported actions remain committable. |
| T21 | P0 | Implemented | Central class-level queries drive multiclass feature eligibility/scaling and Monk/Barbarian Unarmored Defense semantics. |
| T22 | P0 | Implemented | Monster initiative, saves and skills preserve and roll the exact stat-block bonuses instead of reconstructing character proficiency math. |
| T23 | P0 | Implemented | Standard Action use is turn-scoped and authoritative; Action Surge spends its resource and grants exactly one additional Action. |
| T24 | P0 | Implemented | Typed calculation overrides feed authoritative results and explanations from the same source. |
| T25 | P0 | Implemented | Archive preflight, expected revision, rollback export and import mutation bind to one resolved campaign identity, including cross-campaign cases. |
| T26 | P0 | Implemented | Encounter monster actor/token placement is one resumable idempotent operation with reconciliation; cancel/retry cannot leave duplicate or orphan placements. |
| T27 | P1 | Implemented | Save-feature Advantage changes the actual d20 roll mode and records the source in the reviewed result. |
| T28 | P1 | Implemented | All eight Weapon Mastery properties have selection, availability, preview and commit handling. Push deliberately records a reviewed manual geometry consequence rather than guessing token placement. |
| T29 | P1 | Implemented | Rage has an active lifecycle covering start, duration/end, damage/resistance, restrictions and resource use. |
| T30 | P1 | Implemented | Armor Class intent is explicit (`derived`, fixed stat-block value or reviewed override) with migration and round-trip coverage. |
| T31 | P1 | Implemented | Structured accessible consequence review replaces truncating native confirmation text and preserves cancel-without-spend behavior. |
| T32 | P1 | Implemented | Browser campaign duplication uses the dedicated exact-revision, idempotent atomic API rather than archive export/import. |
| T33 | P1 | Implemented | Browser archive transfer uses bounded streaming with progress, cancellation and compatibility behavior for large campaigns. |
| T34 | P1 | Implemented | Search opens the exact permission-safe actionable record, including saved encounters, and labels truthful fallbacks. |
| T35 | P1 | Implemented | Advancement load failures retain choices and pending state, show an actionable error and support in-context retry. |
| T36 | P2 | Implemented with declared boundary | Deterministic replay identifiers and verification cover persisted engine/API roll paths. Contracts and UI explicitly state that the seed hash is stored with the result, not witnessed before it, so host seed fairness is not claimed. |
| T37 | P2 | Implemented | Summons and transformations produce a typed controlled-creature handoff. Complete source stat blocks are immutable after review, every lifecycle mutation rechecks current membership/workspace, same-tab reload restores a scoped draft and requires re-preview, confirm is atomic and cancel spends nothing. |

## Implementation group summary

| Group | Tickets | Current result |
| --- | --- | --- |
| Rules trust | T01-T04, T09, T20-T24, T27-T31, T36-T37 | Implemented across SDK, API, client and reviewed UI paths; frozen aggregate acceptance passed |
| Campaign/session UX | T05-T06, T08, T10-T12, T26, T31-T35 | Connected public-UI flows exist; final canonical T08 acceptance passed |
| Data and recovery | T15-T17, T25-T26, T33 | Local code and recovery contracts are implemented; hosted state-plus-asset proof remains X03 |
| Maintainability/operations | T07, T13-T14, T18-T19 | Bounded validation, lazy boundaries, safer session transport, evidence gating and observability are implemented; repeated root acceptance passed while hosted operational evidence remains X05 |

## Final local evidence record

The frozen implementation/test tree passed three consecutive `TURBO_FORCE=true pnpm check` runs. Each completed lint 25/25, typecheck 25/25, E2E typecheck, tests 25/25 with 303 files, 1,822 passing tests and 1 skipped test, and builds 15/15.

The final isolated canonical Playwright journey passed 1/1 in 1.4 minutes against frozen snapshot `20260716T030254960Z`. It recorded campaign `camp_mrmxcfz6lx78jmmt`, actor `act_mrmxciy7vlh0m0q1`, combat `cmb_mrmxd9kkqv4iwb56`, action `cact_mrmxdfqn3iqu6eca` and preview `dnd-action-preview:3d8ca513-f058-4d00-8425-5c979d681bd1`.

| Final artifact | Recorded result |
| --- | --- |
| `apps/web/src/App.tsx` | 11,192 physical lines |
| `packages/system-sdk/src/index.ts` | 17,982 physical lines |
| `apps/api/src/app.ts` | 25,499 physical lines |
| `apps/api/src/app.test.ts` | 40,388 physical lines |
| `packages/api-contracts/src/index.ts` | 16,302 physical lines |
| Main web JavaScript | `index-C-sw-hED.js`, 800.87 kB / 211.85 kB gzip |
| Deferred dice runtime | 557.37 kB / 147.01 kB gzip |
| Production CSS | 233.71 kB / 41.48 kB gzip |

## External/manual evidence queue

| ID | Required evidence | Owner/environment | Release gate |
| --- | --- | --- | --- |
| X01 | Repeated internal and invited GM/player sessions, including abandonment, correction, conflict and staff-repair outcomes | Representative groups and observer | Internal Playable / Private Alpha |
| X02 | Live OIDC login/link and SCIM provision/deprovision/role lifecycle, if advertised | Selected provider tenant and operator | Private Alpha |
| X03 | Timestamped, non-no-op hosted state-plus-asset backup, restore, forward migration and rollback | Selected deployment and storage providers | Private Alpha / Public Beta |
| X04 | NVDA, Narrator, VoiceOver, TalkBack, Edge, Firefox, Safari and physical touch-device matrix | AT users and real devices/browsers | Private Alpha / Public Beta |
| X05 | Hosted HTTPS, capacity, proxy, realtime, observability, alert and incident drills | Deployment and operators | Private Alpha / Public Beta |
| X06 | Approved content inventory, attribution and distribution boundary | Release owner/counsel | Public Beta |
| X07 | Independent security review of auth/session/lockout/proxy behavior, plugin boundary and adversarial AI privacy/prompt/tool cases | Qualified independent reviewer | Public Beta |
| X08 | Representative AI quality/provider-handling evaluation covering citations, rules versus homebrew, retrieval, retention/training settings and user disclosure, if AI is offered | DMs/players and release/privacy owner | Public Beta |

## Pull-request quality bar

- Keep each mutation permission-checked, exact-revision and idempotent where replay is possible.
- Keep server behavior authoritative; UI checks are usability, not security.
- Add the smallest regression that fails for the fixed counterexample.
- Preserve compatibility deliberately and label deprecation windows.
- Do not claim hosted, device, legal, security, AI-quality or repeated-user evidence from local tests.
- Do not broaden accepted manual geometry/prose boundaries into guessed automation.

## Definition of complete

A **code ticket** is complete when its authoritative path, connected surface where required, permissions, persistence/recovery behavior and focused regression coverage are present. By that definition, T01-T37 are implemented, with T01-T03/T05-T06 already landed and the remaining code in this working tree.

A **release stage** is complete only when every applicable X01-X08 item is recorded in addition to the completed frozen-tree local validation. The current working tree is therefore implementation-complete and locally accepted for this audit backlog, but not yet release-evidence-complete.
