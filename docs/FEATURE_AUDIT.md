# Feature Audit

> Current post-remediation audit, 2026-07-14. Repository source, tests, generated contracts, and runtime journeys are evidence; older roadmap prose is not. The implementation is an uncommitted working tree above base commit `e1501351ebc2`, so release publication remains a separate action.

## Executive finding

Open Tabletop Engine is a connected, API-first D&D 5.5e virtual tabletop. It is no longer accurately described as an architectural foundation or a collection of prototypes. Accounts, campaigns, permissions, invitations, reviewed characters, sheets, scenes, maps, tokens, dice, chat, journals, encounters, combat, rules transactions, compendium/homebrew, assets, archives, realtime recovery, operational controls, plugins, and the existing AI agent participate in the same persistent campaign model.

The current code connects the preparation, player-action, combat, campaign-management, restart, export, and restore mechanics needed for a representative D&D session. That is an implementation-path claim, not evidence that a group has completed a whole session without assistance. The audit's code-addressable non-AI P0-P3 defects were implemented beyond the original first-ticket sequence. Remaining gates require people or external infrastructure: repeated real campaign sessions, live OIDC/SCIM, hosted HTTPS/recovery/migration/rollback, production observations, manual assistive technology and cross-browser/device checks, content/legal approval, and independent security review.

The AI agent was deliberately left intact. Manual proposal review and governed automatic execution are both supported campaign governance modes; proposal-only language is not a product requirement.

## Method and claim boundary

The audit traced user surfaces through client calls, API schemas/routes, authorization, rules resolution, persistence, realtime events, archive behavior, and tests. Representative counterexamples were converted into regression tests. Browser evidence exercised public UI paths rather than page-script state injection. Documentation is cited only when the implementation or an external operating procedure is the subject.

Status meanings:

- **Complete:** connected, persistent, permission-checked, and automated sufficiently for the declared scope.
- **Functional but incomplete:** useful end to end, but a stated manual/external/compatibility boundary remains.
- **Prototype:** demonstrable behavior not yet appropriate for normal campaign reliance.
- **UI-only / Backend-only:** one side lacks a connected counterpart.
- **Broken:** a verified implemented path currently produces an incorrect or unsafe outcome.
- **Not implemented:** no connected implementation exists.
- **Unable to verify:** evidence requires unavailable credentials, infrastructure, content, devices, or human participants.
- **Intentionally out of scope:** a deliberate product boundary, not an accidental stub.

## Repository overview

| Layer | Implementation and responsibility |
| --- | --- |
| Web | React/Vite application in `apps/web`; `App.tsx` composes extracted actor, combat, encounter, session, campaign, world, compatibility, inventory, controlled-creature, compendium, AI, and administration panels |
| API | Fastify application in `apps/api`; route modules and `app.ts` own authorization, validation, revisions, idempotency, transactions, persistence coordination, realtime, archives, operations, plugins, and AI integration |
| Rules | `packages/system-sdk`; D&D static content, validation, calculations, actions, advancement, rest, damage, effects, spells, inventory, monsters, controlled creatures, and custom content |
| Shared model | `packages/core`; campaign records, events, permissions, compatibility, tactical state, pending transactions, and shared state operations |
| Contracts/client | `packages/api-contracts` and `packages/api-client`; generated/runtime OpenAPI alignment and reusable typed calls |
| Persistence | SQLite state store plus asset providers, maintenance/backups, snapshot history, archive staging, compensating rollback, and recovery tests |
| Realtime | WebSocket event sequence, privacy filtering, bounded history, delta reconciliation, presence, and authoritative snapshot recovery |
| Other apps | desktop, worker, relay, asset edge, AI gateway; scoped around the main single-writer API topology |
| Extension/AI | plugin SDK/runtime, example plugins, AI core, provider integrations, proposal review and governed automatic execution |
| Operations | Docker/self-host/hosted recipes, readiness, migration/security/deployment/performance/capacity checks, docs site, SBOM and release-evidence scripts |

Workspace packages are declared by `pnpm-workspace.yaml`. The central product is the API/web/core/system-SDK path; auxiliary apps and SDKs support that product rather than define a second one.

## Capability inventory

### Accounts, campaigns, permissions, and persistence

| Capability | Status | Evidence and boundary |
| --- | --- | --- |
| Registration, password sessions, reset, MFA | Complete | Auth/session/revocation routes and broad API/browser coverage in `apps/api/src/app.test.ts` and `tests/e2e/auth-tabletop.spec.ts` |
| User profile and preferences | Complete | Revisioned profile API and connected account/preferences UI; `profile-rules-transfer.test.ts` |
| OIDC login/linking | Functional but incomplete | Issuer/endpoint HTTPS, redirect/DNS/IP/SSRF and verified-email hardening in `oidc-http-security.ts`; live provider smoke remains external |
| SCIM provisioning/role mapping | Functional but incomplete | Server-admin SCIM contracts, safe role mapping and tests; live provider lifecycle remains external |
| Campaign create/onboarding/settings | Complete | Resumable setup, rules profile, starter content and persistence across API/web/browser |
| Campaign duplicate/archive/restore/delete | Complete | Revisioned/idempotent administration UI/API; `campaign-duplication.test.ts`, `campaign-administration.test.ts` |
| Invitations, accept/revoke/expiry, rejoin | Complete | GM/assistant/player/observer roles, MFA/session policy and private invite browser journey |
| Membership and multiple DMs | Complete | Owner, GM, assistant GM, player, observer, scoped grants and authorization matrix |
| Campaign ownership transfer | Complete | Current-owner-only, exact revision, idempotency, reason/audit, UI confirmation; `campaign-ownership-transfer.tsx` |
| Character assignment/transfer | Complete | Same-campaign recipient validation, accept/decline/cancel, status/history and connected account UI; `character-transfer-panel.tsx` |
| Character-specific permissions | Complete | Private actor/item redaction, owner/grant checks, permission-filtered snapshots and mutation routes |
| Scene-level delegation | Complete | Read/update-only bounded grants, exact revision/idempotency and management UI; `scene-delegation-routes.ts` |
| Session scheduling/planning | Complete | Agenda, linked records, scheduled time, notes, start/complete lifecycle; `session-desk-panel.tsx` |
| Archived-campaign write policy | Complete | Lifecycle gates prevent normal mutation while retaining authorized read/restore |
| Concurrent shared editing | Complete | Consequential mutations require exact current revisions and idempotency; stale writes return structured conflict/current state; route contract tests |
| Durable acknowledgement | Complete within SQLite topology | Serialized mutation coordinator, commit/rollback failure handling, nested dirty tracking and restart tests; `sqlite-store.ts` |
| Refresh/reconnect | Complete | Sequence/gap detection, deltas and permission-filtered authoritative snapshot; `realtime-connection.ts`, `realtime-snapshot-delta.ts` |
| Snapshot history | Complete | Bounded, permission-filtered history and API tests; `snapshot-history.ts` |

### Character creation, advancement, and session sheet

| Capability | Status | Evidence and boundary |
| --- | --- | --- |
| Level-one creator | Complete for declared SRD scope | Species/ancestry, background, ability increases, origin feat, class, skills, tools, languages, equipment, mastery, spells and class choices; focused creator tests and browser fixtures |
| Character import/validation/repair | Complete for JSON contract | Versioned validation, issue provenance, lossless unknown fields and non-destructive repair preview; arbitrary proprietary formats are not claimed |
| Campaign character review | Complete | Optional-by-default policy, fingerprinted submit/approve/change request/override, token/combat gates; `dnd-character-review.ts` |
| Core sheet hierarchy | Complete | Session-first stats/actions/defenses/resources/loadout/effects plus calculation details; `actor-panel.tsx`, `actor-loadout-panel.tsx` |
| Ability, skill, save, initiative, death rolls | Complete | Server rolls with formula/source/visibility/history and actor-specific action IDs |
| Weapon attacks and typed damage | Complete | Attack/damage actions, critical formulas, typed multi-component/multi-target preview/apply, defenses, temp HP and combat sync |
| HP, temp HP, death and stabilization | Complete | Prepared healing/damage, zero-HP lifecycle, death saves and actor/combatant consistency |
| Short and Long Rest | Complete | Player-selected Hit Dice, server rolls, class resources/Pact Magic, HP/max/temp/death/exhaustion recovery and exact revisions |
| Advancement, ASI/feats/subclasses | Complete | Class-specific schedules, explicit choices, Constitution HP, durable pending reviews, cancel/commit; feat matrix tests |
| Multiclassing | Complete within declared profiles | Eligibility, class levels, hit-die pools, spell-slot composition and custom class profile seam |
| Spell known/prepared/always/spellbook | Complete | Dedicated mutation, class/resource semantics, Wizard ritual availability and UI |
| Inventory/equipment/attunement | Complete | Equip/carry, benefits/actions gates, capacity/prerequisites, charges, cursed recovery, revision/audit |
| Features/resources/limited uses | Complete within modeled content | Spend/recharge/recovery and sourced actions; unsupported prose remains manual |
| Conditions/effects/concentration | Complete | Immunity sources, duration/schedule, replacement/expiry/cleanup and reasoned override |
| Currency, containers, weight, ammunition | Complete | Cycle/depth checks, encumbrance, transfers, party stash and commerce |
| Biography/notes/custom fields | Complete | Descriptive/homebrew fields remain editable without bypassing managed rules roots |
| Mobile/tablet/keyboard sheet use | Functional but incomplete | Responsive and automated keyboard/accessibility tests pass; manual device/AT certification remains external |

### Scenes, maps, tokens, and tactical play

| Capability | Status | Evidence and boundary |
| --- | --- | --- |
| Scene create/edit/duplicate/reorder/archive/activate | Complete | Connected manager UI, exact revisions, permissions and persistence |
| Map/image upload and positioning | Complete | Asset upload, rendition selection and scene background controls |
| Square grid/gridless and calibration | Complete | Origin/scale/dimensions/calibration UI and tests; hex expansion is intentionally deferred |
| Pan/zoom and responsive canvas | Complete | Canvas viewport transforms and resize handling in `scene-canvas.tsx` |
| Token placement/linking/ownership/locking | Complete | Actor tray supports pointer and accessible non-drag placement; server permissions |
| Token movement, size, rotation, elevation, bars, labels | Complete | Revisioned transforms and UI controls |
| Hidden/invisible and GM/player views | Complete | Snapshot/event redaction, GM preview and visibility-specific rendering |
| Multi-select, bulk actions, copy/paste, undo | Complete | Connected tabletop operations with tests |
| Drawing, measurement, pings | Complete | Persistent annotations plus ruler and presence-aware pings |
| Areas/templates and targeting | Complete within typed scope | Circle/cone/line overlays, multi-target selection and preview summaries |
| Fog, walls, doors, windows | Complete within declared 2D model | Authored barriers/open state and permission-aware fog |
| Lights/darkness and senses | Complete within declared model | Typed light, magical darkness, darkvision/blindsight/truesight/tremorsense and per-token vision |
| Layers and GM-only information | Complete | Layered scene/token/journal visibility and private snapshot filtering |
| Difficult terrain and cover | Advisory by design | Measurement and explicit directional rulings; no guessed pathfinding/collision/AC mutation |
| Large scenes/maps | Functional but incomplete | Deterministic local capacity/performance gates exist; hosted production envelope remains external |

### Encounter and combat management

| Capability | Status | Evidence and boundary |
| --- | --- | --- |
| Encounter create/search/clone/save/history | Complete | Encounter builder, catalog, budgets and durable records |
| Add PCs, monsters, allies, hidden participants | Complete | Selected readiness review; placement is not required to avoid accidental omission |
| Initiative roll/manual entry/ties/order | Complete | Server rolls or reviewed values; explicit order and hidden redaction |
| Surprise and first-turn setup | Complete within reviewed setup | Participant flags are reviewed; narrative determination remains DM-controlled |
| Turn/round/active indication | Complete | Previous/next/end controls, lifecycle events and responsive UI |
| Actions, bonus actions, reactions/readied declarations | Complete within typed tracking | Action metadata/resources and reaction use; trigger interpretation may be manual |
| Legendary/lair/regional mechanics | Complete | Advanced schedules/resources and operator surfaces |
| Conditions, concentration, durations, saves | Complete | Sourced effects and scheduled start/end processing |
| Recharge and monster resources | Complete | Server rolls, spend/recover and action availability |
| Damage/healing/temp HP/defenses/critical | Complete | Typed transactions, exact revisions, actor/combatant synchronization and undo |
| Multiple targets/save-for-half | Complete when typed | Atomic reviewed per-target resolution; ambiguity stops without mutation |
| Cover/difficult terrain/opportunity attacks | Advisory/manual | Tools support the ruling but do not infer geometry or silently change math |
| Undo mistakes | Complete for consequential modeled transactions | Stale-safe captured roots; later edits prevent destructive undo |
| Combat completion and history | Complete | End lifecycle, recent combats, audit and reward linkage |
| XP, milestone, GP, loot | Complete | Permission-aligned revisioned/idempotent award and claim flows |

### Dice, rolls, chat, and communication

| Capability | Status | Evidence and boundary |
| --- | --- | --- |
| Standard notation and modifiers | Complete | Parser/evaluator supports declared notation, keep/drop, rerolls, minimums and optional explosions with transparent details |
| Checks, saves, attacks, damage, healing, initiative, death | Complete | Typed actor/system roll actions and server authority |
| Advantage/disadvantage/critical/bonus dice | Complete | Formula transformation, source display and cancellation behavior |
| Multiple damage types | Complete | Roll breakdown feeds typed per-component damage resolution |
| Public/private/GM/self rolls | Complete | Visibility policies, redacted realtime/history and search |
| Secret roll trust/audit | Complete | Server-generated result and durable roll/audit record |
| Inline rolls/macros/reusable actions | Complete | Chat/reference cards and permissioned macro lifecycle |
| Public chat/whispers/in-character/OOC | Complete | Channel/recipient/actor metadata and realtime delivery |
| Reply/edit/delete/moderation/search | Complete | Permission-aware history and local mutation feedback |
| Roll/spell/item/rules cards | Complete within supplied metadata | Structured chat cards and references |
| Pings/presence/connection state/reconnect | Complete | Presence lifecycle, sequence tracking and authoritative refresh |
| Notifications/accessibility | Functional but incomplete | Named regions/status and keyboard paths automated; manual AT notification quality remains external |

### Spells, monsters, items, and compendium

| Capability | Status | Evidence and boundary |
| --- | --- | --- |
| Spell metadata/search/filter/reference | Complete for bundled/user content | Level/school/time/range/components/duration/concentration/ritual and action metadata where provided |
| Spell preparation, slots, Pact Magic, rituals | Complete | Class-aware dedicated state and recovery; `dnd-spell-preparation.ts` |
| Upcasting/scaling/attack/save/damage/healing | Complete when data-backed | Typed preview/source; prose-only exceptions stay manual |
| Persistent effects/summoning/transformation | Complete within typed helpers | Confirmed lifecycle and controlled-creature integration |
| Monster/NPC stat blocks/search/filter/clone | Complete | Catalog/custom content, encounter insertion, token/actor links and hidden presentation |
| Monster actions/traits/reactions/legendary/lair | Complete within supplied records | Actions/resources/recharge/defenses/immunities/senses and combat operation |
| Custom monsters/scaling/templates | Complete within custom builder | Campaign-scoped, versioned and provenance-aware; no proprietary catalog claim |
| Weapons/armor/shields/gear/tools/consumables | Complete within supplied content | Properties, mastery, state, actions, quantity, charges and compendium import |
| Magic items/attunement/curses | Complete within typed metadata | Eligibility/state/effects and audited manager recovery |
| Party inventory/loot/merchants | Complete | Containers, transfers, stock, buy/sell, claims and audit |
| Campaign compendium | Complete | Full-text/filter, source/version/license, conflict keep/merge/replace, duplicate detection and actor import state |
| Homebrew builders | Complete | Monster, spell, item, feat, species, background, subclass and condition forms/API |
| Content provenance/licensing metadata | Complete in code; external review required | Package content notice, per-record metadata and archive preservation; release owner/legal signoff remains external |
| Proprietary D&D content | Intentionally out of scope | No recommendation or implementation to scrape/copy/bundle unauthorized material |

### Journals and campaign information

| Capability | Status | Evidence and boundary |
| --- | --- | --- |
| Notes/handouts/NPC/location/quest/faction/session records | Complete | Journal/world graph types, folders/tags and session links |
| Player-visible, DM-only and per-player access | Complete | Server filtering and permission-aware search/snapshot/events |
| Folders, tags, search, backlinks | Complete | Campaign knowledge index and world graph UI |
| Entity relationships | Complete | Typed links among actors, locations, quests, factions, scenes, items and journals |
| Images/rich text/references/embedded rolls | Complete within sanitized document model | Asset links and structured references; arbitrary unsafe HTML is not required |
| Session summaries and campaign canon review | Complete | Session lifecycle, history and explicit canon workflow |
| Revision history/autosave/error recovery | Complete | Exact revisions, idempotency, local error state and snapshot history |
| Export/portability | Complete | Knowledge collections and references participate in validated archives |

### Exploration, social, and in-person-assisted play

| Capability | Status | Evidence and boundary |
| --- | --- | --- |
| Exploration preparation and record keeping | Functional but incomplete | Scenes/maps, measurement, pings, journals, locations, quests, factions, session agendas, checks and persistent canon provide connected support. There is no claim that travel procedure, discovery, hazards, line of sight, navigation, or open-ended environmental prose is automatically adjudicated. |
| Exploration resolution during play | Functional but incomplete | Players can roll typed checks, move tokens, reveal information and record outcomes; geometry-dependent and narrative consequences remain explicit DM rulings. Automated evidence covers those component paths, not a complete exploration encounter observed with a real group. |
| Social-encounter preparation and play | Functional but incomplete | NPC/world records, in-character and out-of-character chat, whispers, checks/saves, handouts, notes and canon review are connected. There is no dedicated social-combat engine, disposition simulator, or automatic resolution of persuasion, deception, negotiation, influence, or NPC intent. |
| In-person-assisted tabletop use | Functional but incomplete | The responsive web workspace, GM/player visibility, local dice/chat, token controls and independent clients can assist a table using laptops or tablets. Automated Chromium phone/tablet/keyboard coverage exists, but no physical-room, projector, shared-screen, touch-device, offline-network, or assistive-technology session has been certified. |
| Dedicated kiosk, shared-display, hot-seat, or offline table mode | Intentionally out of scope for the audited P0-P3 program | In-person-assisted play uses ordinary authenticated browser clients. A separate kiosk/shared-display/hot-seat mode and offline-first operation/reconciliation are deferred until observed table use demonstrates a need; neither is counted as external evidence or as an implemented capability. |

### Assets, archives, ownership, and recovery

| Capability | Status | Evidence and boundary |
| --- | --- | --- |
| Images/maps/tokens/portraits/handouts | Complete | Upload, signed delivery, permissions and connected selectors |
| Type/size/quota validation | Complete | Provider/config limits and server validation |
| Folders/tags/search/reuse | Complete | Asset library metadata and UI |
| Deduplication/renditions/thumbnails | Complete | Content hash, WebP/thumbnail variants, variant-aware URLs; `asset-renditions.ts` |
| Delete/dangling references/lifecycle | Complete | Reference checks, archive state, cleanup and audited deletion |
| Campaign export/import | Complete | Version, schema, references, checksums, conflict modes, redaction and ownership regeneration |
| Large asset archive streaming | Complete | Additive framed binary export/import with raw asset frames, SHA-256 trailers, backpressure, caps and temp staging; legacy JSON remains compatible |
| Atomic failed import recovery | Complete | State/object prewrite snapshots and compensating rollback; staging verified before mutation |
| Character/scene/journal/compendium/asset portability | Complete within archive contract | Scoped/partial exports and dependency closure |
| Backup/restore/retention | Complete locally | SQLite maintenance and coordinated state/object guidance/tests; hosted drill remains external |
| Schema migration and rollback | Complete locally | Golden/current fixtures and smoke scripts; target deployment drill remains external |

### API, developer platform, plugins, and AI

| Capability | Status | Evidence and boundary |
| --- | --- | --- |
| Versioned REST API/OpenAPI | Complete for declared contract | `/api/v1`, generated schemas, non-AI runtime request and response enforcement |
| Authentication/authorization | Complete | Session/worker identities and permission matrices; UI hiding is not the security boundary |
| Revisions/idempotency/conflicts | Complete | The [exhaustive non-AI mutation contract](verification/non-ai-mutation-route-contract-2026-07-13.md) locks 246 routes; shared writes use exact revisions and retry keys, while 37 operator mutations declare K/R/P/X runtime and OpenAPI guarantees |
| WebSockets/events | Complete | Sequenced, filtered campaign events and delta/snapshot recovery |
| Webhooks | Complete outbound-only | Allowlisted metadata events, HMAC secret/rotation, SSRF/DNS pinning, queue/retry/audit; no inbound mutation |
| API client and examples | Complete | Reusable typed client plus example plugins/integrations |
| Plugin lifecycle/capabilities | Complete within trusted-admin boundary | Signed-by-default production posture, typed permissioned commands, attribution/audit and runtime isolation |
| Hostile plugin marketplace | Intentionally out of scope | Current runtime is not marketed as a hardened adversarial ecosystem |
| Headless/worker access | Complete within scoped identity | Worker commands map to allowlisted permissioned operations; no full server-admin session |
| Existing AI agent | Complete relative to accepted baseline | Providers, context retrieval, tools, memory, audit, citations/privacy diagnostics, proposal review and governed auto execution remain intact |
| AI behavior redesign | Intentionally out of scope | This non-AI remediation neither makes the agent optional nor forces proposal-only operation |

### Operational quality

| Capability | Status | Evidence and boundary |
| --- | --- | --- |
| Install/local development | Complete | `pnpm` workspace commands, seed/demo and contributor docs |
| Docker/self-host | Complete within single-writer topology | Compose reflects SQLite API + object storage + optional scoped worker; no misleading unused Postgres/Redis |
| Environment validation/readiness | Complete | Production secrets/providers fail closed with safe reason codes |
| Error handling/logging/redaction | Complete | Structured request IDs, local status, safe logs, signed URL/token redaction |
| Monitoring/diagnostics | Complete locally | Health/readiness, admin diagnostics, performance/capacity artifacts; production integration remains deployment-specific |
| Rate limiting/input validation | Complete | Strict JSON body behavior, location-aware query/params coercion, OpenAPI runtime validation |
| Dependency/security health | Complete locally | Production audit, smoke, SBOM and threat model; independent review external |
| Browser/responsive/accessibility automation | Complete for declared automated baseline | Chromium desktop/phone/tablet and keyboard/labels; wider/manual matrix external |
| Automated tests/build | Complete locally | Consolidated package unit/integration/component/browser plus security/migration/deployment/performance/docs gates are green; external/hosted evidence remains separate |
| Demo/onboarding/docs | Complete | Seeded campaign, GM/player guides, beta dogfood/recovery/release docs |
| Release process | Functional but incomplete | Scripts/evidence templates exist; dirty worktree and external release gates intentionally block publication |

## End-to-end workflow audit

### Campaign setup journey

| Steps | Result | Evidence/UX finding |
| --- | --- | --- |
| Install/open, create account, create campaign | Complete | Bootstrap and normal-auth browser suites; resumable setup |
| Configure rules, invite, accept, rejoin | Complete | Rules profile, invitation role/expiry/revoke, private-context acceptance |
| Create/import and review character | Complete | Legal level-one browser fixtures plus import/repair/review contracts |
| Create scene, upload map, calibrate grid, place tokens | Complete | Connected content/tabletop UI; accessible placement path |
| Create/import encounter and review launch | Complete | Saved participants and direct reviewed combat start |
| Create journal/handout and plan first session | Complete | Linked knowledge/session desk lifecycle |
| Evidence boundary | Functional path complete; whole-session usability unverified | Automation proves connected steps and recovery, not real-user discoverability, pacing, or successful completion without assistance |

Phase-3 UX findings:

| Dimension | Current finding |
| --- | --- |
| Smooth path | Account/campaign creation, rules profile, invite, reviewed character, scene, encounter and session plan form one resumable route with persisted intermediate state. |
| Confusing or likely abandonment points | Import repair, character-review fingerprints, grid calibration and encounter readiness are the most concept-dense steps. Helper text and validation exist, but only observed users can establish whether the terminology and sequence are understandable. |
| Dead ends | No known automated-path dead end remains: expired/revoked invites, invalid imports, missing choices and stale writes return a next action instead of silently failing. Live identity providers and real-user recovery remain unverified. |
| Click burden | Preparing a first session still requires several deliberate objects and confirmations. Resumability prevents repetition, but no timed task study or click-count target proves that the setup burden is acceptable. |
| Permission edge cases | Owner, GM, assistant-GM, player and observer capabilities are server checked; invitations and private character review do not rely on hidden buttons. Denials preserve state and expose a bounded error. |
| Data-loss edge cases | Draft setup state, exact revisions, idempotency, snapshot history and archive validation cover refresh, retry and stale-edit cases locally. Hosted storage failure and recovery remain external evidence. |
| Rules edge cases | Campaign profile and level-one validation block illegal modeled choices; unsupported/homebrew exceptions remain reviewable or manual and do not silently mutate managed rules roots. |
| Accessibility and mobile | Semantic controls, non-drag token placement, keyboard paths and phone/tablet layouts are automated. Physical touch, screen reader and non-Chromium setup work remain manual gates. |
| Empty, loading, success, and error states | Empty campaigns expose setup/starter actions; async work exposes busy state; successful steps persist and update the workspace; validation, permission and conflict errors are visible and retryable. Comprehension of those states is not yet user-tested. |

### Player journey

| Steps | Result | Evidence/UX finding |
| --- | --- | --- |
| Join/open owned character/find core stats | Complete | Permission-filtered party/sheet and session-first actor panel |
| Check/save/attack/damage | Complete | Typed server actions with visible formulas and source terms |
| Cast/spend/move/target | Complete | Spell/resource, token and target flows with permission feedback |
| Receive damage/healing/condition/end concentration | Complete | Prepared typed transactions and effect lifecycle |
| Rest and level up | Complete | Durable preview/review/commit, pending advancement resume/cancel |
| Refresh/reconnect | Complete | Sequence/delta and authoritative snapshot; no duplicate mutation |
| Evidence boundary | Functional path complete; whole-session usability unverified | Automated action paths do not establish player comprehension, pacing, social/exploration quality, or assistive-technology usability |

Phase-3 UX findings:

| Dimension | Current finding |
| --- | --- |
| Smooth path | An assigned character opens into session-first stats and actions; checks, saves, attacks, spells, resources, movement, damage, conditions, rest and advancement use connected server-owned flows. |
| Confusing or likely abandonment points | Dense spell/resource/loadout interactions and the difference between a manual ruling and an automated transaction are the likeliest comprehension risks. Calculation sources and local explanations reduce ambiguity, but player observation is still required. |
| Dead ends | No known supported action ends in an inert control. Missing ownership, unavailable resources, unsupported prose and stale state produce a denial, manual boundary, or retry path without mutation. |
| Click burden | Common rolls and actions are direct; advanced inventory, spell preparation, effect and advancement work uses focused panels and preview/confirm steps. The safety confirmations are intentional, but their pacing cost is not measured. |
| Permission edge cases | Assigned-character, character-owner and scoped-grant checks filter records, actions, events and snapshots. Private actors and GM-only information are redacted rather than merely hidden in the UI. |
| Data-loss edge cases | Pending advancement, idempotent retry, exact revisions, realtime gap recovery and authoritative snapshots preserve work across reload/reconnect. Hosted partition and device-loss behavior remains external. |
| Rules edge cases | Typed cases show formula, source and result; invalid state blocks; ambiguous prose becomes an explicit DM ruling. The sheet does not claim to automate every published exception. |
| Accessibility and mobile | Primary actions remain reachable at automated phone/tablet widths with keyboard names and status regions. Screen-reader announcement quality, physical touch ergonomics and non-Chromium behavior remain unverified. |
| Empty, loading, success, and error states | Empty action/resource lists explain the absence; requests show busy state; successful actions update durable history/state; validation, permission, resource and conflict errors stay adjacent or enter a live status region with a retry path. |

### Combat journey

All requested representative steps are connected: scene activation, reviewed participants, initiative/manual order/ties/surprise flags, movement measurement, attacks, advantage/disadvantage/cover ruling, typed damage/defenses, conditions/concentration, templates/multiple targets/save-for-half, recharge/reactions, zero HP/death saves, turn/round advance, end, rewards and history. Geometry-dependent cover, difficult terrain, opportunity attacks, and exceptional spell prose are explicit DM decisions rather than hidden automation.

The prior player attack omission, collapsed turn control, selected-participant omission, synthetic initiative, silent permission errors, and actor/combatant damage drift now have targeted UI/API tests.

Phase-3 UX findings:

| Dimension | Current finding |
| --- | --- |
| Smooth path | Reviewed encounter participants flow into initiative, turn operation, typed actions/effects, completion, rewards and history without a separate state model. |
| Confusing or likely abandonment points | Initiative readiness, hidden participants, advanced monster resources and advisory-versus-automated tactical rulings carry the highest cognitive load. Labels and previews exist; observed combat pacing remains required evidence. |
| Dead ends | An ambiguous action, stale target, missing resource or unauthorized operation stops before mutation and explains the manual/retry path. No known automated-path dead end remains, but unsupported prose intentionally ends in DM adjudication. |
| Click burden | Participant/order review and consequential multi-target preview/confirmation add deliberate steps; common turn controls remain exposed. No timed encounter study proves that the confirmation cost is acceptable in sustained play. |
| Permission edge cases | Managers control encounter/combat lifecycle; players use only owned/granted actors and allowed targets. Hidden/private participants, rolls and events are filtered at the API and realtime layers. |
| Data-loss edge cases | Actor and combatant changes commit atomically with exact revisions, idempotency, audit and stale-safe undo; reconnect uses sequence/delta/snapshot recovery. Hosted failure during a real combat remains unevidenced. |
| Rules edge cases | Typed damage, defenses, criticals, effects, concentration, durations, resources and zero-HP state are automated; cover, terrain, opportunity attacks and exceptional prose remain visible rulings. |
| Accessibility and mobile | Turn controls, actor actions and tabletop controls have responsive/keyboard regressions and non-drag placement. Screen-reader live-combat announcements and physical touch pacing require manual verification. |
| Empty, loading, success, and error states | Empty encounter/combat states offer setup rather than inert trackers; requests expose busy state; success updates the active turn/history; validation, permission, stale and unsupported errors remain visible without partial application. |

### Campaign-management journey

NPC/location/quest/faction links, handouts, session notes, campaign canon, search/backlinks, summaries, export and restore are connected. The existing AI agent can draft or operate according to campaign governance; this remediation did not alter its capability. The archive journey verifies actual state reversal rather than a no-op import.

Phase-3 UX findings:

| Dimension | Current finding |
| --- | --- |
| Smooth path | Knowledge records, links, sessions, canon, search, administration, export and restore share the campaign model and survive reload/archive round trips. |
| Confusing or likely abandonment points | World-graph relationships, canon review, ownership transfer and archive conflict modes are the densest administrative concepts. Confirmations and summaries exist, but information architecture still needs real-GM observation. |
| Dead ends | Empty searches, missing links, invalid archives, stale revisions and unavailable permissions return bounded outcomes rather than inert screens. Live-provider and hosted-recovery failures remain outside local proof. |
| Click burden | Routine search/edit/link work is connected, while destructive or ownership-changing actions require review and confirmation. No measured campaign-prep study establishes the cost of maintaining a large knowledge base. |
| Permission edge cases | GM/assistant/player/observer visibility, per-player journals, ownership transfer and destructive actions are enforced server-side and reflected in filtered snapshots/search/events. |
| Data-loss edge cases | Exact revisions, idempotency, history, validation, staged import and compensating rollback protect local state/assets. Hosted backup, migration and rollback drills still block release evidence. |
| Rules edge cases | Campaign profiles and reasoned overrides are explicit; journals/canon and plugin commands cannot silently rewrite managed D&D state. The AI agent retains manual proposal and governed automatic execution modes unchanged. |
| Accessibility and mobile | Named responsive panels and keyboard/error states are automated; dense knowledge graphs, long-form editing, screen readers, physical tablets and non-Chromium browsers need manual verification. |
| Empty, loading, success, and error states | Empty collections and no-result searches expose create/clear-filter actions; async operations show progress; success updates durable history; permission, conflict, validation and restore errors remain actionable and non-destructive. |

These four journeys establish connected implementation coverage, not a claim that a complete real session has been observed. Exploration, social interaction, room/device ergonomics, group pacing and cross-role comprehension remain part of the external session and device evidence queue.

## UX, accessibility, and state feedback

- Primary sheet/combat/encounter actions are extracted into named panels and remain reachable at supported automated widths.
- Actor placement has a non-drag keyboard/pointer path.
- Mutation failures appear next to the action or in a live status region rather than only in a rejected network call.
- Busy/loading/retry states use shared retryable and abort/session-switch guards.
- Realtime shows connection/recovery state and refreshes only the required snapshot/delta.
- Modal labels, focus behavior, keyboard activation, phone/tablet layout and advanced panels have automated regressions.
- Manual NVDA, Narrator, VoiceOver, TalkBack and representative physical touch-device evidence is still required; automation cannot certify those experiences.

## Broken, partial, misleading, or absent surfaces

### Broken

No current code-addressable P0-P3 defect is intentionally left open. A consolidated failing test or external-session defect reopens this statement and must be fixed at the narrowest responsible layer.

### Functional but incomplete / unable to verify

- Repeated real GM/player campaigns without engineering intervention or database repair.
- Live OIDC and SCIM against selected providers over hosted HTTPS.
- Manual assistive-technology, Edge/Firefox/Safari, and physical touch-device certification.
- Hosted HTTPS backup/restore, migration, rollback, capacity, observability, alerting, and support drills.
- Release-owner content/legal/attribution approval and an independent security review.

### Intentionally absent

Voice/video, social/community discovery, 3D terrain/VFX, procedural generation, a broad marketplace, universal rules DSL, unrelated game-system breadth, speculative hex investment, unauthorized proprietary content, and an unmeasured multi-region rewrite are not current product requirements. The current AI agent is not absent, optionalized, or proposal-only.

## Validation record

### Focused implementation evidence

- System SDK rules suites cover advancement, rests, damage, conditions, effects, spells, controlled creatures, inventory, monsters and class schedules.
- API suites cover every non-AI route's authentication/authorization/preconditions, runtime OpenAPI validation, concurrency, archives, SQLite, realtime, OIDC, workers, plugins and campaign operations.
- Core/contracts/client suites cover shared state, transaction records and wire compatibility.
- Web suites cover actor/combat/encounter/session/tabletop/knowledge/admin flows, responsive behavior and mutation feedback.
- Browser suites cover normal seeded play, clean bootstrap, invitations, legal creators, reviewed combat, reconnect/restart, and non-no-op archive recovery.

### Consolidated local validation

<!-- CONSOLIDATED_VALIDATION -->
- `pnpm check` passed: **28/28 lint targets** in 25.605 seconds, **28/28 typecheck targets** in 12.002 seconds, E2E TypeScript compilation, **28/28 test targets** in 2 minutes 34.753 seconds, and **17/17 build targets** in 54.566 seconds. The production web build retained its non-blocking chunk-size warning.
- The strict standalone API matrix passed **89/89 files and 611 tests**, with **1 intentional live-identity-provider smoke skip**, in 190.3 seconds. The root rerun independently passed the same **89 files / 611 passed / 1 skipped** matrix in 153.39 seconds. Major companion totals were web **92 files / 458 tests**, system SDK **20 / 159**, core **10 / 75**, API contracts **15 / 72**, API client **9 / 38**, and worker **1 / 27**.
- The normal Chromium acceptance suite passed **49/49** in 7.3 minutes; the clean-deployment bootstrap suite passed **1/1** in 56.5 seconds; `pnpm e2e:typecheck` passed. All seven tracked browser evidence screenshots remained byte-for-byte unchanged.
- `pnpm security:audit` reported **no known vulnerabilities**; security smoke passed **7/7**, migration smoke **2/2**, and deployment smoke **2/2**. The selected performance smoke and soak tests each passed; the unselected counterpart in each filtered run is reported by Vitest as skipped by design.
- `pnpm perf:capacity` passed the deterministic single-node/single-writer envelope for **1 GM, 5 players, 6 realtime connections, 200 scene tokens, 302 observed chat messages, and 60 journals**. P95 measurements were **18.661 ms initial connect, 65.14 ms reads, 40.826 ms mutations, 40.905 ms fanout, and 2.748 ms reconnect**; total workload time was **379.23 ms**, SQLite size was **372,736 bytes**, and persistence after reopen was true.
- `pnpm docs:site:test`, `pnpm docs:site:check`, `pnpm sbom:test`, `pnpm v1:evidence:test`, `pnpm v1:issues:test`, and final `git diff --check` passed.
- `release:smoke` was not run as one command because its clean-worktree gate correctly rejects this intentionally uncommitted implementation. Its local component gates were run individually. `v1:issues:check` remains an authenticated GitHub/external-state check and is not local release evidence.
- The only API skip requires live `OTTE_IDENTITY_SMOKE_BASE_URL`, `OTTE_IDENTITY_SMOKE_ADMIN_TOKEN`, and `OTTE_SCIM_BEARER_TOKEN` values (or equivalent local OIDC/SCIM setup). Pre-existing dirty AI implementation files were preserved outside this remediation; the statement here is that this remediation did not change AI behavior, not that every AI-path working-tree file equals `HEAD`.
<!-- /CONSOLIDATED_VALIDATION -->

### Evidence that remains external or manual

- Live OIDC/SCIM sandbox and hosted HTTPS smoke.
- NVDA, Narrator, VoiceOver and TalkBack; Edge, Firefox, Safari and representative physical touch devices.
- Internal and invited external GM/player groups completing repeated sessions/campaign arcs.
- Hosted backup/restore, forward migration, rollback, capacity and production-observability drills.
- Release-owner legal/content provenance review and independent security review.

Passing local automation is necessary but never substituted for those artifacts.
