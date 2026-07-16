# Feature Audit

> Current-state audit, 2026-07-16. Evidence is committed HEAD `e4c6ac9f666793e3a0dba7bcfcca3e2a71e74f9e` plus the validated implementation working tree. T01-T37 are code-complete and the frozen local aggregate/canonical acceptance gates passed. Hosted, provider, device, legal, independent-security, real-session and AI-quality claims remain X01-X08.

## Executive finding

Open Tabletop Engine is a broad, connected, DM-first D&D 5.5e VTT implementation. Accounts, campaigns, permissions, members, setup, characters, scenes, square/gridless maps, tokens, encounters, combat, dice, chat, journals, assets, archives, realtime recovery, plugins and the campaign-governed AI agent participate in one persistent permissioned model.

The code-addressable findings from the audit have been implemented. That includes the earlier P0 rules/recovery defects, previously backend-only campaign/gridless capabilities, resumable setup, player lifecycles, archive/encounter atomicity, browser/API drift, operations controls and architecture-budget work. The frozen-tree acceptance runs passed; X01-X08 now determine promotion beyond local acceptance.

This document therefore does **not** declare a public release. It declares the audited implementation tranche and its local acceptance complete.

The AI implementation retains both manual proposal review and governed automatic execution. Automatic execution still traverses campaign/deployment policy, permissions, typed transactions and audit controls; no audit ticket converted it to proposal-only behavior.

## Method and status boundary

The audit traces each claim through public UI, typed client/contracts, API validation/authorization, revisions/idempotency, rules resolution, persistence, realtime filtering, archives and focused regressions.

| Status | Meaning |
| --- | --- |
| Implemented | Connected authoritative code and focused regression coverage exist in the working tree/baseline |
| Locally accepted | Connected implementation plus the named frozen-tree aggregate/browser proof are recorded |
| Functional with declared boundary | Works for the stated scope; manual/external/compatibility boundary is intentional and visible |
| External evidence required | Requires real users, providers, hosted infrastructure, devices or independent review |
| Not in product scope | Deliberately not claimed |

Historical `e4c6ac9` defect descriptions in earlier audit revisions are superseded by this current-state ledger.

## Repository overview

| Layer | Responsibility |
| --- | --- |
| `apps/web` | Session, character, tabletop, campaign, recovery, review and administration UI; heavy panels load on demand |
| `apps/api` | Authorization, validation, exact revisions, idempotency, transactions, persistence coordination, realtime, archives, operations, plugins and AI integration |
| `packages/system-sdk` | D&D content/validation/calculations/actions/advancement/rest/damage/effects/monsters/mastery/controlled-creature behavior |
| `packages/core` | Shared campaign records, permissions, events, compatibility, tactical state and resumable operation state |
| `packages/api-contracts` / `packages/api-client` | Runtime OpenAPI alignment and reusable typed calls |
| Persistence/realtime | SQLite single-writer state, asset providers, snapshot/archive/recovery controls and permission-filtered websocket convergence |
| Plugins/AI | Trusted-admin typed plugin commands; optional AI with manual and governed-auto modes |
| Operations | Deployment recipes, readiness, backups, retention, observability, security and release-evidence tooling |

## Capability inventory

### Accounts, campaigns and permissions

| Capability | Current state | Boundary |
| --- | --- | --- |
| Registration, password sessions, reset and MFA | Implemented | Independent security review remains X07 |
| OIDC login/linking | Functional with declared boundary | Live selected-provider proof is X02 if advertised |
| SCIM provisioning/role mapping | Functional with declared boundary | Live provider lifecycle is X02 if advertised |
| User profile/preferences | Implemented | Revisioned authoritative updates |
| Campaign create/settings/lifecycle | Implemented | Archived-campaign write policy remains server-enforced |
| Resumable first-session setup | Implemented | Versioned safe draft is scoped to organization, user and campaign; authoritative completion survives reload/sign-out for the same identity |
| Campaign duplication | Implemented | Browser uses the dedicated exact-revision/idempotent API |
| Invitations and rejoin | Implemented | Role/session policy and private invite flow remain authoritative |
| Member list, role update and removal | Implemented | Owner/current-user/SCIM guards, explicit impact review and removed-user access denial |
| Ownership and character transfer | Implemented | Revisioned accept/decline/cancel/audit behavior |
| Character/scene-specific permissions | Implemented | Snapshot/event filtering remains server authoritative |
| Session planning | Implemented | Agenda, linked records, time, notes and lifecycle |
| Concurrent editing/recovery | Implemented for declared single-node scope | Unsafe conflicts remain explicit review; multi-replica HA is not claimed |

### Character, advancement and player sheet

| Capability | Current state | Boundary |
| --- | --- | --- |
| Level-one creator | Implemented | Declared SRD-oriented choices only |
| Import/validation/repair | Implemented | Unknown legacy/homebrew fields remain lossless; arbitrary proprietary formats are not claimed |
| Character review | Implemented | Fingerprinted submit/approve/change/override and play gates |
| Core sheet statistics and quick rolls | Implemented | Abilities, saves, skills, initiative, speed and passives use authoritative payloads |
| HP/temp HP/death/stabilization | Implemented | Death Saves commit atomically to actor/combat state |
| Heroic Inspiration | Implemented | Visible grant/transfer/spend/reroll lifecycle |
| Rest and resources | Implemented | Hit Dice, class resources, Pact Magic, HP/temp/death/exhaustion recovery |
| Advancement | Implemented | Choices survive errors; load failure is actionable and retryable |
| Multiclassing | Implemented | Central relevant-class-level semantics and correct half-caster slot composition |
| Spell/inventory/effects/concentration | Implemented | Unsupported prose is labeled/manual rather than guessed |
| Armor Class intent | Implemented | Derived, fixed stat-block and explicit override states are distinct |
| Mobile/keyboard/accessibility automation | Implemented in automated scope | Physical AT/device matrix remains X04 |

### Rules automation

| Capability | Current state | Boundary |
| --- | --- | --- |
| Exact monster initiative/saves/skills | Implemented | Stored stat-block bonuses roll directly |
| Standard Action and Action Surge | Implemented | Turn-scoped ledger and exactly one extra Action |
| Saving-throw Advantage | Implemented | Actual roll mode and source are reviewed |
| Calculation overrides | Implemented | Same typed source drives result and explanation |
| Weapon Mastery | Implemented | All eight properties are selectable/reviewable/committable; Push is deliberately reviewed manual geometry |
| Rage | Implemented | Active lifecycle drives effects, restrictions, duration and spend |
| Recorded-roll replay | Implemented with a trusted-host boundary | Persisted engine/API paths share deterministic replay metadata; no pre-roll host commitment or host-seed fairness is claimed |
| Rules support boundary | Implemented | Supported, reviewed manual and unsupported states are visible; supported actions remain committable |

### Scenes, maps and tokens

| Capability | Current state | Boundary |
| --- | --- | --- |
| Scene create/edit/duplicate/reorder/archive/activate | Implemented | Exact revisions and permissions |
| Square/gridless mode | Implemented | Gridless suppresses grid size/calibration/snapping; mode persists across reload |
| Map upload/positioning and calibration | Implemented | Calibration is square-only |
| Pan/zoom/responsive canvas | Implemented | Physical-device evidence remains X04 |
| Token placement/linking/movement/size/rotation/elevation | Implemented | Gridless movement remains unsnapped |
| Hidden/invisible and GM/player views | Implemented | Permission-filtered snapshots/events |
| Multi-select/bulk/copy/paste/undo | Implemented | Revisioned tabletop operations |
| Drawing/measurement/pings/templates/targets | Implemented | Geometry is visual/reviewed, not a universal collision engine |
| Fog/walls/doors/windows/light/senses/layers | Implemented | Single-node small-group performance boundary |
| Cover/difficult terrain/pathfinding | Functional with declared boundary | Directional/geometry rulings remain manual; no guessed AC/path mutation |

### Encounters and combat

| Capability | Current state | Boundary |
| --- | --- | --- |
| Encounter create/search/clone/save/history | Implemented | Exact search result opens the saved actionable encounter |
| Monster/ally/PC placement | Implemented | One resumable idempotent operation prevents orphan/duplicate actor-token pairs |
| Initiative/manual entry/ties/order/surprise | Implemented | Narrative surprise remains reviewed |
| Turn/round indication and conflict recovery | Implemented | One unchanged-position retry; unsafe conflicts require review |
| Action/Bonus Action/Reaction economy | Implemented | Server authoritative |
| Attacks, saves, damage, concentration and consequences | Implemented | Accessible review and cancel-without-spend |
| Controlled creatures | Implemented | Typed summon/transformation handoff locks complete source stat blocks, restores a scoped draft after same-tab reload, rechecks current authority and confirms atomically |

### Dice, chat, journals and information

| Capability | Current state | Boundary |
| --- | --- | --- |
| Public/private/GM roll visibility | Implemented | Private core-stat rolls use selected visibility |
| Roll history/formulas/modifiers/replay | Implemented | The UI replays stored formula, seed and result consistency and states that this is not a pre-roll commitment |
| Chat, whispers and handouts | Implemented | Permission filtering and audit apply |
| Journals, folders, links and visibility | Implemented | Campaign-owned persistent records |
| Search/navigation | Implemented | Exact actionable targets with truthful fallbacks |

### Assets, archives and recovery

| Capability | Current state | Boundary |
| --- | --- | --- |
| Asset upload/renditions/references | Implemented | Provider durability is deployment-specific |
| Archive validation/import/export | Implemented | Bounds, checksums and identity-bound target/rollback |
| Large archive streaming | Implemented | Browser progress/cancel and bounded transfer path |
| Campaign import recovery | Implemented | Resumable operation/reconciliation and rollback artifact |
| Coordinated state-plus-asset backups | Implemented locally | Hosted provider-native non-no-op proof remains X03 |
| Retention/pruning | Implemented | Permissioned preview/apply with metrics/audit |
| Migration/rollback | Implemented locally | Target-host proof remains X03 |

### API, plugins and AI

| Capability | Current state | Boundary |
| --- | --- | --- |
| Typed REST/OpenAPI/client | Implemented | Contract drift remains a monitored regression risk |
| Plugin commands/permissions/review | Implemented | Trusted-admin extension boundary; not hostile-code isolation |
| Typed managed D&D subroots | Implemented | Managed fields validate; unknown legacy/homebrew data is preserved |
| AI manual proposal review | Implemented | Optional policy/disclosure/provider controls |
| AI governed automatic execution | Implemented and preserved | Uses permission intersection and authoritative transactions; not converted to proposal-only |
| AI safety/context/audit | Implemented locally | Independent adversarial review and quality/provider evaluation remain X07-X08 |

### Operational quality

| Capability | Current state | Boundary |
| --- | --- | --- |
| Supported aggregate validation configuration | Locally accepted | Three consecutive forced root runs passed on the frozen implementation/test tree |
| Lazy web boundaries | Locally accepted | Final production bundle sizes are recorded below |
| Safer session transport | Implemented | Compatible URL-token window remains monitored; external logs/proxies need X05/X07 |
| Conflict/reconnect/write/backup/manual-rules metrics | Implemented | Hosted dashboards/alerts/incident drill remain X05 |
| Self-host/deployment recipes | Implemented | Operators still own TLS, secrets, storage and restore drills |

## End-to-end workflow audit

### Campaign setup journey

The implemented flow is ordered and resumable. A versioned safe-whitelist draft is scoped by organization, user and campaign; completion is authoritative rather than a local checkbox. Square/gridless scene choice is part of setup, and role-specific next steps do not expose DM-only work to players.

### Player journey

Invitation, assignment, legal creation/import, sheet rolls, public/private visibility, Inspiration, Death Saves, actions, consequences, healing, rest and resume are connected. The final frozen canonical run passed; repeated real players remain X01.

### Combat journey

Encounter placement is atomic/resumable; exact monster bonuses, initiative, turn economy, Action Surge, save Advantage, Mastery, Rage, damage, concentration and controlled creatures share reviewed authoritative transactions. Geometry-dependent Push and similar spatial rulings remain explicit manual consequences.

### Campaign-management journey

People management, ownership, duplication, exact search, streamed archives, identity-bound rollback, retention and recovery are connected. Removed users are denied subsequent campaign snapshot and controlled-creature lifecycle mutation access.

### Operations journey

The repository can coordinate scheduled state/asset backup work, expose recovery state, prune measured histories and emit operational metrics. Only an actual selected deployment can prove provider-native state-plus-asset recovery, proxy behavior, capacity and alerts.

## Audit implementation closeout

| Area | Tickets | Current state |
| --- | --- | --- |
| Baseline/P0 correctness | T01-T08, T21-T27 | Implemented and locally accepted by the repeated root and final canonical gates |
| Player and campaign UX | T09-T12, T20, T28-T35, T37 | Implemented with explicit manual geometry/support boundaries |
| Operations/architecture | T13-T19, T36 | Implemented with the T36 trusted-host replay boundary explicit; hosted/manual evidence remains applicable |

The prior "dirty-tree Death Save candidate" and "verified broken rules" sections are superseded. Their counterexamples are now retained as regressions in the implemented paths.

## Intentional boundaries and non-claims

- SQLite single-writer and process-local realtime are the declared small-group topology; HA/multi-replica convergence is not claimed.
- Cover, difficult-terrain routing, line of effect, arbitrary prose and obstacle-dependent Push placement remain reviewed/manual.
- Plugins are trusted-admin extensions, not an OS sandbox for hostile code.
- Proprietary non-SRD content is not distributable without independent rights.
- Automated accessibility coverage is not physical AT/device certification.
- Local backup code is not hosted provider-native recovery evidence.
- AI can still execute automatically when campaign/deployment policy allows; it cannot bypass typed permissioned transactions.

## Validation record

The frozen implementation/test tree passed three consecutive `TURBO_FORCE=true pnpm check` runs. Each run completed lint 25/25, typecheck 25/25, E2E typecheck, tests 25/25 with 303 files, 1,822 passing tests and 1 skipped test, and builds 15/15.

The final isolated canonical Playwright journey passed 1/1 in 1.4 minutes against frozen snapshot `20260716T030254960Z`. Its durable evidence identifiers are campaign `camp_mrmxcfz6lx78jmmt`, actor `act_mrmxciy7vlh0m0q1`, combat `cmb_mrmxd9kkqv4iwb56`, action `cact_mrmxdfqn3iqu6eca` and preview `dnd-action-preview:3d8ca513-f058-4d00-8425-5c979d681bd1`.

| Final local artifact | Recorded result |
| --- | --- |
| `apps/web/src/App.tsx` | 11,192 physical lines |
| `packages/system-sdk/src/index.ts` | 17,982 physical lines |
| `apps/api/src/app.ts` | 25,499 physical lines |
| `apps/api/src/app.test.ts` | 40,388 physical lines |
| `packages/api-contracts/src/index.ts` | 16,302 physical lines |
| Main web JavaScript | `index-C-sw-hED.js`, 800.87 kB / 211.85 kB gzip |
| Deferred dice runtime | 557.37 kB / 147.01 kB gzip |
| Production CSS | 233.71 kB / 41.48 kB gzip |

These results close the local/code-addressable T01-T37 gate. Promotion still requires the applicable external/manual X01-X08 evidence below.

## External/manual gates

| ID | Gate |
| --- | --- |
| X01 | Repeated real GM/player sessions and observed correction/conflict/recovery outcomes |
| X02 | Live selected-provider OIDC/SCIM lifecycle, if advertised |
| X03 | Hosted non-no-op state-plus-asset backup/restore/migration/rollback |
| X04 | Physical assistive-technology/browser/device matrix |
| X05 | Hosted HTTPS/capacity/proxy/realtime/alerts/incident drill |
| X06 | Content inventory, attribution and legal approval |
| X07 | Independent security review, including plugin and adversarial AI cases |
| X08 | Representative AI quality/provider-handling evaluation, if AI is offered |

With local acceptance complete but X01-X08 still open, the product should be described as a locally validated audit candidate, not as production-proven.
