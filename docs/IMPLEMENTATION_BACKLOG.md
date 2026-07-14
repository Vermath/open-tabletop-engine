# Implementation Backlog

> Post-remediation ledger, 2026-07-14. This is the complete non-AI P0-P3 execution record, not only the original first ten tickets. Every code-addressable ticket below is implemented in the current uncommitted working tree. Remaining entries are explicitly external/manual evidence tasks.

## Scope decision

- **Included:** every code-addressable non-AI P0-P3 finding in the feature, D&D rules, product, UX, security, data-integrity, realtime, portability, performance, API, plugin and architecture audits.
- **Not now:** dedicated kiosk/shared-display/hot-seat presentation and offline-first operation/reconciliation are explicit product decisions outside this completed P0-P3 ticket set. They are not external/manual evidence items.
- **Excluded by product decision:** changes to the existing AI agent, its providers, its capability, or its manual/governed-auto modes.
- **Deferred by roadmap:** the **Not now** list in [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md).
- **Publication:** no commit, push, deployment, release, destructive migration, or user-data operation is part of this ledger.

## Recommended execution order and actual completion

1. Establish counterexample tests and versioned D&D validation.
2. Make consequential rules/shared mutations prepared, permissioned, revisioned, idempotent and auditable.
3. Correct progression, rest, damage, condition, attunement, spell, effect and combat semantics.
4. Complete the player/GM session loop and responsive/error-safe UI.
5. Close persistence, realtime, archive and recovery integrity.
6. Harden auth, workers, plugins, runtime API contracts, deployment and logging.
7. Complete campaign knowledge, custom content, inventory, controlled creatures, webhooks and asset tooling.
8. Bound performance and decompose only along proven domain seams.
9. Run the full local release matrix, then collect external evidence.

Steps 1-9 are complete locally. The external evidence queue below is now the only remaining stage work and is not an unfinished code ticket.

## Epic E1 — Versioned, explainable D&D transactions

| Field | Definition |
| --- | --- |
| Problem | Direct or loosely validated actor/item mutations could store legal-looking but wrong D&D state |
| User value | Players and DMs can trust a successful result and inspect how it was calculated |
| Scope | Versioned validation/repair, prepared advancement/rest/action/damage/effect transactions, exact revisions, idempotency, audit and undo |
| Non-goals | Parsing arbitrary rules prose; universal rules DSL; proprietary content |
| Dependencies | `packages/core`, `packages/system-sdk`, API mutation coordinator, contracts/client |
| Relevant code | `dnd-validation-preview.ts`, `dnd-rules-completion.ts`, prepared routes in `apps/api/src/app.ts`, `packages/core/src/dnd-rules-mutation-state.test.ts` |
| Technical approach | Pure preview produces sourced result/hash; server stores preparation; confirmation rechecks permission/revisions/hash and commits atomically |
| Rules implications | Typed automation or explicit non-mutating manual result; no guessed exception |
| Data model | Version/issue metadata, prepared/pending records, captured undo roots and exact timestamps |
| API/UI | Preview/confirm/cancel/undo contracts and review cards |
| Security | Server authority, campaign/actor permission and bounded reasoned override |
| Migration | Lossless legacy validation and repair preview; unknown fields retained |
| Tests | Pure counterexamples, API transaction/replay/stale/permission tests, client/UI review, browser journey |
| Acceptance / DoD | Wrong counterexamples fail or compute correctly; stale/replayed/unauthorized confirmations do not mutate; audit and persistence verified |
| Effort / confidence / status | XL / High / Complete |

## Epic E2 — Correct character creation, progression, recovery and loadout

| Field | Definition |
| --- | --- |
| Problem | Creator/progression/rest/inventory paths previously omitted choices or applied generic class behavior |
| User value | A player can build, play, rest and level a legal supported character without spreadsheet repair |
| Scope | Full declared level-one choice graph, review policy, class schedules, multiclass pools, HP/temp/death, spells, loadout, attunement and transfers |
| Non-goals | Every proprietary class/subclass/spell/item; unrestricted raw patching |
| Dependencies | E1; D&D static content; compendium provenance |
| Relevant code | `level-one-creator.test.ts`, `feat-eligibility.test.ts`, `dnd-spell-preparation.ts`, `actor-loadout-panel.tsx`, `dnd-character-review.ts` |
| Approach | Data-backed choices plus class-specific pure resolvers; durable pending reviews; dedicated mutations for managed roots |
| Rules/data | Class/resource/feat/subclass/spell/hit-die schedules and custom profile seam |
| API/UI | Creator/review/advancement/rest/preparation/attunement/transfer flows |
| Security | Owner versus campaign actor manager; reviewed-character gates for tokens/combat |
| Migration | Pending choices and review fingerprints archive/restart safely |
| Tests | Class/species/background matrix, progression/rest/attunement/API/UI/browser fixtures |
| Acceptance / DoD | Representative supported characters create, review, restart, rest and advance with exact expected state |
| Effort / confidence / status | XL / High / Complete |

## Epic E3 — Trustworthy encounter, combat and effect operation

| Field | Definition |
| --- | --- |
| Problem | Synthetic initiative, participant omission, incomplete actions/effects and actor/combat drift made combat unsafe |
| User value | A GM and players can run a complete encounter without fighting the interface or repairing state |
| Scope | Readiness, initiative/order/ties/hidden state, actions/resources, typed damage, effects, recharge/reactions, death, rewards/history, tactical advisory tools |
| Non-goals | Geometry inference, collision/pathfinding, automatic adjudication of every spell/trigger |
| Dependencies | E1/E2; scenes/tokens; realtime; reward/inventory records |
| Relevant code | `combat-setup.ts`, `combat-panel.tsx`, `dnd-typed-damage-combat.ts`, `dnd-effect-lifecycle.ts`, `dnd-combat-progression.ts` |
| Approach | Reviewed participant plan and server initiative; atomic actor/combatant updates; scheduled sourced effects |
| Rules/data | Actions/bonus/reaction, damage defenses, concentration, zero HP, recharge, legendary/lair/regional state |
| API/UI | Responsive controls, local errors, review/undo, reward and history surfaces |
| Security | Manager/owner/player-action boundaries and private participant redaction |
| Migration | Combat/reward/effect metadata in validated archives |
| Tests | Pure rules, API sync/concurrency, web controls, full browser combat |
| Acceptance / DoD | Full representative combat completes; no participant disappears; no wrong target/state applies; rewards persist |
| Effort / confidence / status | XL / High / Complete |

## Epic E4 — Durable shared state, realtime convergence and campaign portability

| Field | Definition |
| --- | --- |
| Problem | Silent stale writes, broad rollback, reconnect gaps and buffered/invalid archives endangered persistent campaigns |
| User value | A campaign survives concurrency, refresh, restart, export/import and recoverable failures |
| Scope | Mandatory mutation preconditions, serialized persistence, dirty tracking, sequence/delta/snapshot history, strict/atomic archives, framed streaming, backup/migration/recovery |
| Non-goals | Multi-region consensus or an unmeasured database rewrite |
| Dependencies | Shared mutation coordinator, SQLite/object providers, API contracts |
| Relevant code | `sqlite-store.ts`, `realtime.ts`, `realtime-snapshot-delta.ts`, `archive-validation.ts`, `archive-stream.ts`, `archive-asset-restore.ts` |
| Approach | Exact revision + retry identity; commit-safe dirty baseline; permission-filtered reconciliation; validate/stage before publish; compensating object rollback |
| Rules/data | Archive validation includes D&D invariants and reference closure |
| API/UI | Structured 409/current state, connection recovery status, legacy and stream archive clients |
| Security | Archive identity/secret redaction, campaign permission, caps/checksums |
| Migration | Golden/current fixtures, retention and coordinated state/asset restore |
| Tests | Two-client conflicts, flush failures, restart, gaps/deltas, malicious/large archive and rollback tests |
| Acceptance / DoD | No silent overwrite or lost covered acknowledgement; bounded archive round trip is non-no-op and atomic |
| Effort / confidence / status | XL / High / Complete |

## Epic E5 — Complete campaign preparation and knowledge UX

| Field | Definition |
| --- | --- |
| Problem | Campaign administration, knowledge, map preparation and session actions had disconnected or inaccessible edges |
| User value | A DM can prepare and resume a session from one coherent workspace; players can reach primary actions |
| Scope | Profiles/rules, duplication/ownership/character transfer, sessions, journals/world graph/canon, maps/grid/tokens/vision, responsive panels, placement and errors |
| Non-goals | Social network, voice/video, 3D spectacle or theme breadth |
| Dependencies | Campaign permissions, assets, realtime, contracts |
| Relevant code | `session-desk-panel.tsx`, `world-graph-panel.tsx`, `campaign-ownership-transfer.tsx`, `scene-canvas.tsx`, `actor-panel.tsx` |
| Approach | Focused panels with typed callbacks, shared mutation/retry/session guards and accessible semantic controls |
| Rules/data | Campaign rules profile and advisory tactical rulings remain explicit |
| API/UI | Full connected UI for administration, session planning, knowledge, scene/token and actor actions |
| Security | UI capabilities derive from server-aligned predicates; server still authoritative |
| Migration | Records participate in versioned archives and snapshot history |
| Tests | Component/contract/responsive/accessibility and browser end-to-end flows |
| Acceptance / DoD | No known primary-action dead end at supported automated widths; failures are visible and retry-safe |
| Effort / confidence / status | XL / High / Complete |

## Epic E6 — Security, API, plugin and deployment contract hardening

| Field | Definition |
| --- | --- |
| Problem | Identity discovery, worker privilege, plugin defaults, readiness and API schema drift could bypass intended boundaries |
| User value | Hosted/self-hosted operators and integrations receive predictable, least-privilege behavior |
| Scope | OIDC/SCIM/SSRF, scoped worker, signed plugin posture, runtime non-AI OpenAPI request/response validation, readiness, rate limits, redaction, threat/deployment docs |
| Non-goals | Hostile-code marketplace, enterprise identity expansion, AI behavior changes |
| Dependencies | API route inventory/contracts, deployment config, plugin runtime |
| Relevant code | `oidc-http-security.ts`, `worker-identity.ts`, `plugin-runtime.ts`, `openapi-runtime-validation.ts`, deployment smoke tests |
| Approach | Fail closed, explicit allowlists/capabilities, location-aware validation, safe diagnostics and exhaustive auth matrices |
| Rules/data | Consequential D&D endpoints share the same contract/precondition enforcement |
| API/UI | Typed client, admin diagnostics, visible configuration failures |
| Security | Central purpose of epic; includes token/URL/log redaction and unsigned-plugin denial in production |
| Migration | No public version break; legacy test helpers inject exact current revisions without weakening production schemas |
| Tests | Route inventory/auth/runtime schema, adversarial OIDC/worker/plugin, readiness/security/deployment smoke |
| Acceptance / DoD | Invalid non-AI bodies/responses fail contract; observer/worker/plugin cannot exceed authority; missing production config is not healthy |
| Effort / confidence / status | XL / High / Complete |

## Epic E7 — Campaign content, economy, controlled creatures and integrations

| Field | Definition |
| --- | --- |
| Problem | Homebrew, campaign content, complex creatures, economy and external notifications lacked complete governed workflows |
| User value | DMs can adapt the product to actual campaigns without unsafe raw state edits |
| Scope | Compendium provenance/conflicts, custom builders, containers/commerce/loot, controlled creatures/transforms, advanced mechanics, webhooks, asset renditions/dedupe |
| Non-goals | Unauthorized content, inbound webhook mutation, marketplace expansion |
| Dependencies | E1/E4/E6, asset provider, campaign permissions |
| Relevant code | `dnd-custom-content.ts`, `dnd-inventory-commerce.ts`, `dnd-controlled-creatures.ts`, `campaign-webhooks.ts`, `asset-renditions.ts` |
| Approach | Campaign-scoped versioned records and typed preview/confirm flows; metadata-only signed outbound events |
| Rules/data | Preserve source/license/version/usage and source-linked lifecycle |
| API/UI | Dedicated builder, inventory/commerce, controlled-creature, webhook and thumbnail panels/contracts |
| Security | Manager permissions, revisions/idempotency/audit; SSRF/DNS pinning; one-time webhook secret |
| Migration | Archive-safe metadata with secret redaction and reference validation |
| Tests | Unit/API/contracts/client/UI plus archive/security lifecycle tests |
| Acceptance / DoD | Each workflow persists, respects permissions/conflicts, round-trips safely and does not bypass core transactions |
| Effort / confidence / status | XL / High / Complete |

## Epic E8 — Performance, maintainability and release evidence automation

| Field | Definition |
| --- | --- |
| Problem | Monoliths, large bundles, full-state writes and incomplete evidence could make every change/release risky |
| User value | Faster, safer iterations and a supportable small-group operating floor |
| Scope | Domain/static-data/panel extraction, architecture/bundle budgets, deferred panels, capacity/soak, docs/SBOM/evidence/release scripts |
| Non-goals | Rewrite, microservice decomposition, multi-region architecture or arbitrary line-count churn |
| Dependencies | Stable seams from E1-E7 |
| Relevant code | `app-architecture-budget.test.ts`, `module-boundaries.test.ts`, extracted API/web/SDK modules, root scripts |
| Approach | Extract coherent ownership with dependency injection; guard budgets; measure deterministic workloads |
| Rules/data | Static D&D identifiers/tables are dependency-free; mutable resolution remains in pure domain functions |
| API/UI | No behavior/API change; code splitting/deferred loading where appropriate |
| Security | Extraction must preserve checks and runtime validation |
| Migration | None beyond compatible module boundaries |
| Tests | Full package typecheck/tests/build plus architecture, bundle, performance, soak/capacity and docs/evidence gates |
| Acceptance / DoD | Behavior unchanged, budgets pass, local small-group envelope passes, release claims stay evidence-bounded |
| Effort / confidence / status | L / High / Complete |

## Completed implementation-ready ticket ledger

Shared constraints for every ticket: use existing `packages/core` domain types; keep the API authoritative; preserve permissive SDK-code licensing and content attribution; add no broad dependency without need; do not change public behavior accidentally; do not modify the AI agent; preserve user work; add focused unit/integration/UI tests and use public UI for browser evidence where applicable.

| ID / priority | Precise objective and user-facing outcome | Likely files/subsystems | Acceptance criteria | Required tests and manual check | Dependencies | Effort / confidence / state |
| --- | --- | --- | --- | --- | --- | --- |
| T01 / P0 | Encode every verified unsafe rules counterexample; wrong state cannot silently regress | system SDK/core tests | Each old failure is red before fix and green after; no mutation on unsupported input | Unit counterexamples; inspect sourced error | None | M / High / Complete |
| T02 / P0 | Add versioned D&D validation and lossless repair preview | SDK/core/API | Type/range/domain issues identify path/source; unknown fields preserved | Unit + API archive/import; manually inspect repair diff | T01 | L / High / Complete |
| T03 / P0 | Prepared transaction framework and raw-patch guard | core/API/contracts/client | Exact preparation/revisions/hash/idempotency required; replay/stale/unauthorized safe | Unit, API concurrency/replay, client/UI review | T02 | XL / High / Complete |
| T04 / P0 | Correct class advancement, ASI/feat/subclass/CON HP schedules | SDK/API/web | Fighter/Rogue exceptional schedules and explicit choices correct; durable pending state | Class matrix unit/API/UI; creator/level browser | T03 | XL / High / Complete |
| T05 / P0 | Correct Short/Long Rest and HP/temp/death recovery | SDK/API/web | Selected Hit Dice, actual deltas, max-before-heal, temp/death/exhaustion/resources correct | Unit edge cases, API stale/replay, UI confirmation, browser rest | T03 | L / High / Complete |
| T06 / P0 | Typed mixed/multi-target damage and active-combat sync | SDK/API/contracts/web | Per-component defenses/temp HP/critical/zero HP; atomic targets; exact combat revision | Unit matrix, API sync/undo/concurrency, damage card | T03 | XL / High / Complete |
| T07 / P0 | Condition immunity and reasoned override | SDK/API/web | Actor/monster/effect/active-item immunity blocks; only actor manager with reason overrides/audits | Unit + API owner/GM matrix + UI | T03 | M / High / Complete |
| T08 / P0 | Equipment/attunement gates and cursed removal | SDK/API/web | Benefits require eligible active state; curse blocks normal removal; manager recovery reason/audit | Unit/API/UI loadout | T03 | M / High / Complete |
| T09 / P0 | Source-linked effect/concentration/schedule lifecycle | SDK/API/web | Replacement, expiry, damage check, cleanup and undo stay consistent | Unit lifecycle + API scheduled commit + UI | T03,T06 | L / High / Complete |
| T10 / P0 | Reviewed encounter start and honest initiative/order | API/web | Selected participants cannot disappear; server/manual initiative, ties/hidden/order reviewed | API combat start + UI setup + browser combat | T03 | L / High / Complete |
| T11 / P0 | Mandatory revisions/idempotency on all consequential non-AI writes/deletes/rewards | API/contracts/client/web | [Locked 246-route inventory](verification/non-ai-mutation-route-contract-2026-07-13.md) has exact precondition/retry identity; 37 operator mutations declare K/R/P/X; stale write is 409 | Static/runtime/OpenAPI route contract, two-client tests, manual conflict UX | T03 | XL / High / Complete |
| T12 / P0 | Serialized durable writes and commit-safe SQLite dirty tracking | store/API | Nested/array/shape changes persist; flush failure rolls back/retries without full per-flush SELECT/stringify | Store failure/restart/perf tests | T11 | XL / High / Complete |
| T13 / P0 | Permission-filtered realtime sequence/delta/snapshot recovery | API/web/core | Gap/duplicate/reconnect converges without private leakage | Realtime unit/integration + two-context browser | T11,T12 | L / High / Complete |
| T14 / P0 | Strict archive validation and atomic state/asset restore | API/store/assets | Required/type/domain/reference/checksum failures precede mutation; rollback leaves prior state/objects | Malicious/N-1/recovery/API + manual non-no-op restore | T02,T12 | XL / High / Complete |
| T15 / P0 | Bounded framed campaign archive streaming | API/contracts/client | Raw asset frames respect backpressure/caps/checksums; stage before mutation; legacy compatible | Parser/route/buffer envelope/rollback; large local round trip | T14 | L / High / Complete |
| T16 / P1 | Complete declared level-one creator and review | SDK/API/web | All required choices, validation, review and combat/token gates connected | Choice fixtures, API review, three public-UI creators | T02,T03 | XL / High / Complete |
| T17 / P1 | Session-first actor sheet and typed action/loadout flows | web/API/client | Primary stats/actions/spells/resources/effects/rest/advance visible and errors local | Component/action contract/browser player journey | T04-T09 | XL / High / Complete |
| T18 / P1 | Spell preparation, known/always/spellbook/Pact/ritual resources | SDK/API/web | Dedicated state mutation and class-aware availability/recovery | Unit, API, client, UI | T03,T16 | L / High / Complete |
| T19 / P1 | Complete monster resources and combat progression | SDK/API/web | Recharge/reactions/legendary/lair/regional/death/effects operate from stat record | Unit/API/operator UI/browser combat | T09,T10 | L / High / Complete |
| T20 / P1 | Rewards, milestone, XP/GP/loot/history | API/web/core | Permission-aligned exact revisions/idempotency; durable reward archive | API stale/replay/archive + UI combat completion | T11,T19 | M / High / Complete |
| T21 / P1 | Responsive combat/tabletop and accessible actor placement | web/styles/e2e | Primary controls never collapse; non-drag placement; named/keyboard paths at supported widths | Component CSS/DOM, phone/tablet/keyboard browser; manual touch queued | T10,T17 | L / High / Complete |
| T22 / P1 | Grid calibration, transforms, vision and tactical advisory tools | web/API/core | Square/gridless, rotation/elevation, doors/windows/light/senses/templates persist; cover/terrain explicit | Unit/UI/API/browser tabletop; manual visual check | T11 | XL / High / Complete |
| T23 / P1 | Profiles, rules, duplication, ownership and character transfers | API/client/web | Exact revision/idempotency, proper parties/reasons/history, connected UI | API lifecycle/client/UI/manual second-account | T11 | L / High / Complete |
| T24 / P2 | Journals, world graph, backlinks, history and canon | core/API/web | Permissioned linked knowledge persists/searches/archives with exact revisions | Unit/API/UI/archive/browser session | T11,T14 | XL / High / Complete |
| T25 / P2 | Compendium provenance/version/conflict/import reporting | SDK/core/API/web | Source/license/usage preserved; duplicate keep/merge/replace explicit | Unit/API/UI/archive | T02,T14 | L / High / Complete |
| T26 / P2 | OIDC/SCIM/SSRF, worker identity, readiness and redaction hardening | API/deployment/docs | Unsafe endpoints/linking/privilege fail; required config unhealthy; secrets absent from logs | Adversarial tests, security/deployment smoke; live IdP queued | T11 | XL / High / Complete |
| T27 / P2 | Signed plugin default and typed command boundary | plugin runtime/SDK/API | Unsigned denied in production; grant+caller permission+revision/audit; no direct storage write | Runtime/auth/threat-model tests; manual trusted plugin smoke | T11,T26 | L / High / Complete |
| T28 / P2 | Strict non-AI OpenAPI request/response enforcement | API/contracts/client | JSON bodies do not coerce; query/path are location-aware; declared statuses validate responses | Route inventory/runtime/schema/client full suite | T11 | XL / High / Complete |
| T29 / P2 | Backups, migrations, recovery CLI/runbooks and local envelope | store/API/scripts/docs | Golden/current fixture, retention, coordinated recovery and deterministic small-group pass | migration/security/deployment/perf/soak/capacity; hosted drill queued | T12-T15 | XL / High / Complete |
| T30 / P2 | Calculation explanations and compatibility reporting | SDK/API/web | Total exposes sources/overrides; system/content/version mismatches visible | Unit/API/client/UI | T02 | L / High / Complete |
| T31 / P3 | Custom D&D content builders | SDK/API/web | Campaign-scoped typed monster/spell/item/feat/species/background/subclass/condition create/edit | Unit/API/contracts/client/UI/archive | T02,T25 | XL / High / Complete |
| T32 / P3 | Inventory, containers, commerce, stash and loot | SDK/API/web | Cycle/depth/weight/ammo/currency/stock/claims/permissions/revisions correct | Unit/API/UI/archive | T03,T20 | XL / High / Complete |
| T33 / P3 | Controlled creatures, summons and transformations | SDK/API/web | Preview/confirm/command/end, ownership/concentration/scene/combat state consistent | Unit/API/UI | T03,T09,T19 | XL / High / Complete |
| T34 / P3 | Advanced effects and spell-helper mechanics | SDK/API/web | Regional/lair/timed/specialized previews are explicit and confirmed | Unit/API/UI | T09,T19 | L / Medium / Complete |
| T35 / P3 | Secure outbound campaign webhooks | API/contracts/client/web/docs | Metadata allowlist, HMAC, SSRF pinning, deadline/queue/retry/audit/redaction; no inbound mutation | Unit/API/client/UI/archive/security | T11,T26 | XL / High / Complete |
| T36 / P3 | Asset renditions, thumbnails and deduplication | API/web/assets | Hash reuse, WebP/thumbnail variants, quota/lifecycle/signed URL correct | Unit/API/UI/storage lifecycle | T14,T26 | L / High / Complete |
| T37 / P2 | Architecture decomposition and budgets | API/web/SDK/tests | Static data dependency-free; coherent routes/pure coordinators extracted; tighter budgets pass | Module-boundary/architecture/typecheck/full suites; diff review | T01-T36 | L / High / Complete |
| T38 / P2 | Complete release/docs/evidence automation and rewrite six audits | root scripts/docs | One current authoritative audit; local commands record exact truth; external gates explicit | docs tests/check, SBOM/evidence/issues tests, diff check | T01-T37 | L / High / Complete |

## Per-ticket execution contracts

Every ticket inherits constraint **C0**: use existing `packages/core` domain types; keep the API authoritative; preserve permission, revision, idempotency and audit semantics where consequential; preserve user data, public compatibility, SDK licensing and content attribution; add no broad dependency without demonstrated need; and do not modify the AI agent's behavior, configuration, providers, tools, manual proposal mode, or governed automatic execution mode. The “Constraints” column names additional ticket-specific limits. “N/A” in the verification matrix is an explicit decision that the layer adds no useful evidence for that ticket, not an omitted requirement.

### Scope, rules, and change guardrails

| ID | Constraints | D&D/rules implications | Must not change | Dependencies |
| --- | --- | --- | --- | --- |
| T01 | C0; deterministic pure counterexamples; unsupported input is non-mutating | Direct: defines safety invariants for advancement, rest, HP, damage, conditions, items and effects | Intentional manual/advisory rulings or already-correct typed results | None |
| T02 | C0; versioned validation; lossless preview before repair | Direct: invalid managed D&D roots must be located without erasing forward-compatible data | Unknown fields, provenance, valid legacy data or source records | T01 |
| T03 | C0; exact prepared inputs, revisions, hash and retry identity; server commits | Direct: consequential rules results become reviewable, stale-safe transactions | Public compatibility, server dice/rules authority or read-only routes | T02 |
| T04 | C0; class-profile schedules and explicit durable choices only | Direct: class level, ASI/feat/subclass and Constitution HP legality | Existing legal characters, multiclass state or class-specific exceptional schedules | T03 |
| T05 | C0; server-rolled selected Hit Dice; exact recovery deltas | Direct: HP/max/temp/death/exhaustion/resource recovery | Player Hit Die choice, HP caps or separate Pact/normal resource semantics | T03 |
| T06 | C0; per-component/per-target preview; atomic actor+combat commit | Direct: defenses, rounding, temporary HP, critical and zero-HP state | Typed breakdown, target order, or actor/combatant consistency | T03 |
| T07 | C0; aggregate all modeled immunity sources; only reasoned manager recovery | Direct: immune conditions cannot silently apply | Normal owner permissions, source attribution or audit reason | T03 |
| T08 | C0; eligible active equipment state and exact actor/item revisions | Direct: benefits/actions/curse recovery follow equip and attunement state | Item provenance, normal curse block or inactive-item behavior | T03 |
| T09 | C0; source-linked instances and scheduled lifecycle; atomic cleanup | Direct: concentration, replacement, expiry and undo stay coherent | Effect source/target history or explicit manual exceptions | T03, T06 |
| T10 | C0; explicit participant readiness and reviewed initiative/order | Direct: combat begins with the intended legal participants and state | Hidden-participant privacy, manual initiative, tie review or surprise ruling | T03 |
| T11 | C0; applies to every consequential **non-AI** mutation; keys remain opaque | Direct: stale or duplicate rules writes cannot silently win | AI routes/agent behavior, safe reads, or public retry compatibility | T03 |
| T12 | C0; acknowledge only after durable commit; bounded dirty detection | Indirect but critical: correct rules state must survive failure/restart | Store schema/API, retryability, or the prohibition on per-flush full-state work | T11 |
| T13 | C0; monotonic sequence and permission-filtered recovery | Direct: every client converges on the same authorized rules/combat state | Private data filtering, event order or authoritative snapshot semantics | T11, T12 |
| T14 | C0; validate schema/domain/references/checksums before any publish; atomic rollback | Direct: restored actor/item/combat records remain calculable and consistent | Pre-import live state, asset bytes, N-1 compatibility or ownership regeneration | T02, T12 |
| T15 | C0; framed raw bytes, backpressure, caps, incremental hashes and staging | Indirect: large campaign rules data/assets remain portable without exhausting the writer | Legacy capped JSON compatibility or bounded-memory guarantee | T14 |
| T16 | C0; declared lawful content scope; no silent choice defaults | Direct: level-one state and review gates are rules-legal and complete | Optional-by-default campaign review policy, homebrew seam or proprietary-content boundary | T02, T03 |
| T17 | C0; session-first hierarchy; typed callbacks; local actionable errors | Direct: player-visible actions must invoke server-owned rules transactions | Server authority, calculation sources or existing desktop/keyboard paths | T04-T09 |
| T18 | C0; class-aware dedicated spell-state mutations | Direct: known/prepared/always/spellbook, slots, Pact Magic and rituals remain distinct | Separate resource pools, source metadata or unsupported-prose boundary | T03, T16 |
| T19 | C0; monster actions/resources derive from supplied stat records | Direct: recharge, reactions, legendary/lair/regional and death progression | Hidden participant handling, authored stat data or DM control | T09, T10 |
| T20 | C0; award/claim transactions are permissioned, revisioned and idempotent | Direct: XP, milestone, GP and loot state cannot duplicate or disappear | Prior rewards, claim ownership, award history or archive portability | T11, T19 |
| T21 | C0; semantic controls and non-drag alternatives at supported widths | No rules-math change; determines whether users can reach core rules/combat actions | Desktop behavior, keyboard access, server permissions or tactical semantics | T10, T17 |
| T22 | C0; persist typed transforms/vision; advisory geometry remains explicit | Direct only where typed; cover, terrain and opportunity-attack rulings remain manual | No guessed collision/cover/pathfinding, no implicit hex support, no privacy leak | T11 |
| T23 | C0; current-owner authority and exact parties/reasons/history | Indirect: campaign profile and character custody determine which rules state may be used | Role meanings, transfer history, character data or AI governance | T11 |
| T24 | C0; permissioned sanitized knowledge graph with archive-safe links | No direct rules math; preserves campaign facts that inform manual rulings | Private notes, visibility, backlinks, sanitization or canon history | T11, T14 |
| T25 | C0; campaign-scoped provenance/version/license and explicit conflict policy | Direct content trust: calculations must identify the content record/version used | Source/license metadata, user content or unauthorized-content boundary | T02, T14 |
| T26 | C0; identity/network controls fail closed and redact secrets | No rules-math change; compromised identity could invoke authorized rules mutations | Password auth, safe local development, identity linking protections or AI/provider behavior | T11 |
| T27 | C0; signed production default; capability intersection; typed application commands only | Direct if extended: plugin rules actions must traverse normal permissions/transactions | No direct storage writes, trusted-admin product boundary or SDK reuse | T11, T26 |
| T28 | C0; strict JSON bodies, location-aware params/query and declared non-AI responses | Direct wire safety: invalid rule mutations cannot look accepted | `/api/v1` compatibility, query/path coercion rules or AI route behavior | T11 |
| T29 | C0; versioned fixtures, coordinated state/assets and measured single-writer envelope | Direct preservation: rules state must survive upgrade, backup and recovery | Current topology, user archives, retention policy or published evidence boundary | T12-T15 |
| T30 | C0; every total exposes ordered sources and compatibility mismatches | Direct: users can distinguish base data, effects, equipment and overrides | Calculated totals, override provenance or mismatch visibility | T02 |
| T31 | C0; campaign-scoped typed builders with validation/provenance | Direct for user content: custom records enter the same rules/data boundary | No universal rules DSL, no proprietary catalog, no raw managed-root patch | T02, T25 |
| T32 | C0; atomic conservation, cycle/depth/weight and permission checks | Direct: carried/equipped/ammunition/currency/loot state affects available actions | Quantity/currency conservation, container ownership or claim audit | T03, T20 |
| T33 | C0; source-linked preview/confirm/reversible lifecycle | Direct: controlled creature/form state, ownership, concentration and combat links stay coherent | Original actor state, ownership, source record or explicit end path | T03, T09, T19 |
| T34 | C0; typed helper only when data is sufficient; confirmation before mutation | Direct for supported advanced effects; exceptional prose remains manual | No guessed natural-language resolution or silent effect application | T09, T19 |
| T35 | C0; outbound metadata only, HMAC, pinned SSRF checks and bounded delivery | No direct rules mutation; event metadata may describe completed actions | No inbound mutation, no secret in archives/logs, no AI behavior change | T11, T26 |
| T36 | C0; content-hash reuse, quotas and permissioned variant lifecycle | No rules-math change; assets must retain links to scenes/tokens/records | Original bytes, reference integrity, authorization or signed-delivery boundary | T14, T26 |
| T37 | C0; extract only coherent seams with explicit dependencies and enforced budgets | Indirect: rules changes must remain traceable across static data, pure resolver, transaction and UI | Runtime behavior, public API, side-effect order or architecture churn for line count alone | T01-T36 |
| T38 | C0; one current evidence-bounded audit set; exact results supplied by validation owner | No new rules behavior; documents must accurately state automated/manual boundaries | Validation markers/totals before final run, historical evidence, or AI manual/governed-auto wording | T01-T37 |

### Verification contract by layer

| ID | Unit verification | Integration verification | E2E verification | Manual verification |
| --- | --- | --- | --- | --- |
| T01 | Pure rules counterexample for every prior unsafe result and unsupported-input no-op | N/A - pure invariant ticket; transaction wiring starts at T03 | N/A - no UI behavior added | Inspect one blocked result for source/path clarity |
| T02 | Version/type/range/domain issue paths and lossless repair transforms | API import/archive accepts valid and rejects invalid records without mutation | N/A - browser import UX is covered with T16/T25 | Compare before/after repair preview, including unknown fields |
| T03 | Preparation hash, revision set, raw-patch guard and idempotent state reducer | API authorization, stale conflict, replay, persistence, audit and undo where supported | Public-UI preview/confirm plus two-client stale-write path | Inspect prepared diff, audit record and conflict recovery |
| T04 | Class schedule/ASI/feat/subclass/Constitution HP matrix | API durable pending advancement, exact revision, cancel and commit | Legal creator/level-up journey for representative exceptional schedules | Review displayed choices and post-commit HP/features |
| T05 | Short/Long Rest edge cases, actual deltas and resource recovery | API stale/replay/persistence and unauthorized rest cases | Player rest preview/confirm/reload journey | Verify recovery summary against starting sheet state |
| T06 | Mixed defenses, rounding, critical, temporary HP, zero HP and multi-target matrix | Atomic API actor/combat sync, stale target, rollback and undo | Player/GM damage-card preview and application journey | Inspect per-component explanation and synchronized tracker |
| T07 | Immunity aggregation and manager-override eligibility | API owner/GM/manager permission, reason and audit matrix | Condition apply/block/reasoned recovery UI path | Confirm blocked source and override audit text |
| T08 | Equipment eligibility, capacity, prerequisites, charges and curse cases | API actor/item revisions, authorization, persistence and audit | Loadout/attunement/blocked curse UI path | Verify inactive benefit removal and manager recovery record |
| T09 | Concentration replacement, duration, scheduled expiry and cleanup/undo | API scheduled commit, damage check, stale/replay and persistence | Cast/concentrate/replace/end journey | Inspect effect timeline and source links before/after undo |
| T10 | Readiness, participant retention, tie/order and hidden-state helpers | API combat-start authorization, explicit initiative and participant set | Reviewed encounter-to-combat browser journey | Review manual initiative, ties, surprise and hidden participants |
| T11 | Exhaustive route inventory/precondition classifier plus explicit operator K/R/P/X and opaque-key boundary tests | Every consequential non-AI route: auth, exact revision or prepared target, replay, stable external delivery, stale 409/current state and response schema | Two-client conflict/retry on representative campaign, rules, and operator actions | Inspect conflict copy and ensure retry does not duplicate work |
| T12 | Nested/array/shape dirty detection and bounded comparison tests | SQLite commit failure, rollback, retry, restart and maintenance/capacity tests | Restart persistence journey after acknowledged mutations | N/A - deterministic failure injection supplies stronger evidence |
| T13 | Sequence/gap/delta reducer and privacy-filter unit tests | WebSocket lifecycle, duplicate/gap recovery, snapshot authorization and bounded history | Independent GM/player contexts through disconnect/reconnect | Inspect connection state and verify no private record appears |
| T14 | Schema/domain/reference/checksum and dependency-closure validators | Malicious/N-1/partial-failure import with state/object rollback | Export, mutate, non-no-op restore and reload journey | Inspect restored state/assets and pre-import state after forced failure |
| T15 | Frame parser, caps, incremental SHA-256 and buffer-envelope tests | Stream export/import through API client and asset provider, including rollback/cancellation | N/A - no browser-only behavior is required for the protocol | Record near-limit round trip and maximum observed buffer size |
| T16 | Choice-graph fixtures and review-fingerprint policy tests | Creator/import/review API, token/combat gates and archive persistence | Three representative legal public-UI creators plus review flow | Inspect one imported repair/review and one rejected choice |
| T17 | Actor-panel action/loadout/resource/error component tests | Client/API action contracts, permissions and local error mapping | Assigned-player sheet journey across roll, cast, damage, rest and advance | Check information hierarchy and primary-action discoverability |
| T18 | Class spell-state, slot/Pact recovery, ritual and availability matrix | Dedicated API/client mutation, stale/replay and persistence | Prepare/cast/spend/rest ritual-capable character journey | Compare displayed availability with class/source state |
| T19 | Recharge/use/reaction/legendary/lair/regional/death progression | API combat resource/effect/turn synchronization and permissions | Monster-operator combat journey | Inspect stat-record actions and hidden participant behavior |
| T20 | Award calculation, allocation and claim state transitions | API stale/replay/authorization/archive/history tests | Combat completion, award and player claim journey | Review assignment/claim history and duplicate-submit behavior |
| T21 | Semantic DOM, focus order, non-drag controls and responsive component tests | Actor/combat/tabletop composition at supported widths and permission states | Phone/tablet/keyboard browser journeys | Physical touch plus NVDA/Narrator/VoiceOver/TalkBack matrix |
| T22 | Grid transforms, calibration, measurement, light/vision/sense helpers | API persistence, exact revision and GM/player visibility tests | Tabletop calibration, movement, door/light/template and reload journey | Visual comparison for alignment/vision and explicit cover/terrain ruling |
| T23 | Profile/transfer/ownership domain transition tests | API/client lifecycle, parties, reasons, stale/replay and archive history | Independent second-account invitation/transfer/accept journey | Verify ownership/destructive confirmations and history wording |
| T24 | Graph link/backlink/search/canon/history reducers | Permissioned API CRUD/search/archive and snapshot/realtime filtering | Session planning, linked knowledge, canon and reload journey | Review long-form editing, empty search and private-note visibility |
| T25 | Provenance/version/license, duplicate and conflict-policy unit tests | API import keep/merge/replace, archive preservation and reporting | Compendium import/conflict-resolution UI journey | Inspect source/license/usage and obtain separate legal approval |
| T26 | OIDC URL/DNS/IP/linking, worker scope, readiness and redaction tests | Auth/SCIM/admin/readiness/security/deployment smoke with adversarial inputs | Local login/account/admin failure-state journeys; live SSO is external | Live IdP provision/link/deprovision plus external log/security review |
| T27 | Signature/trust/capability intersection and command translation tests | Plugin runtime authorization, revision, persistence, audit and failure isolation | Trusted signed-plugin install/command UI journey | Review manifest/grants and confirm no direct storage mutation |
| T28 | Schema compiler, body strictness, location coercion and status-selection tests | Full route inventory, runtime request/response validation, contracts and client suites | N/A - wire enforcement is proven at the API boundary | Review generated/runtime OpenAPI diff for unintended public changes |
| T29 | Fixture/retention/backup-plan helper and capacity-threshold tests | Migration, security, deployment, performance, soak and capacity scripts | Local CLI backup, forward migration, restore, rollback and restart journey | Hosted state+asset recovery/rollback drill with timestamped evidence |
| T30 | Calculation source ordering, override and compatibility resolver tests | API/client calculation and mismatch-report contracts | Calculation explanation/compatibility panel journey | Compare displayed terms against a representative actor/item/effect state |
| T31 | Custom record schemas, validation and pure resolver fixtures | API/contracts/client permissions, archive and compendium integration | Create/edit/use representative custom-content builder journey | Inspect provenance and one deliberately unsupported custom mechanic |
| T32 | Cycle/depth, weight, ammunition, currency, stock and conservation tests | API permission/revision/replay/archive and atomic transfer/claim tests | Inventory, merchant, party stash and loot-claim journey | Reconcile quantities/currency and review contested claim behavior |
| T33 | Summon/companion/transform preview, command and end-state tests | API ownership, concentration, scene/combat sync and persistence | Summon/command/end plus transform/revert journey | Inspect original-state restoration and exceptional-form boundary |
| T34 | Advanced mechanic preview, timing/resource and unsupported-case tests | API confirmation, exact revision, scheduled application and audit | Representative lair/regional/timed-effect combat journey | Adjudicate one prose-only exception and confirm no silent mutation |
| T35 | HMAC, SSRF/DNS pinning, deadline, queue/retry and redaction tests | API/contracts/client/UI/archive delivery lifecycle and authorization | Campaign webhook create/rotate/test/disable UI journey | Hosted receiver interoperability, signature and observability check |
| T36 | Hash reuse, rendition dimensions/type, quota and lifecycle tests | API/storage upload, variant delivery, reference and deletion tests | Upload/select/reuse/delete asset journey | Visually inspect variants and test a near-limit asset |
| T37 | Static-import boundaries, architecture/bundle budgets and pure-module tests | Full package typecheck, tests and builds across extracted seams | Representative browser smoke for unchanged core journeys | Review diff for ownership, side-effect order and non-mechanical line churn |
| T38 | Docs/evidence/SBOM/issues script unit or fixture tests | Docs site tests/check, SBOM/evidence/issues gates and link validation | Repository browser suite recorded in the consolidated matrix | Audit external queue ownership and keep claims evidence-bounded |

These contracts intentionally add no AI implementation work. The existing agent remains available in both manual proposal review and governed automatic execution modes.

## Shared pull-request quality bar

Although this working tree is not being committed by this task, each ticket is shaped to fit a focused review unit:

- no unauthorized API break or migration;
- permission, validation, revision, idempotency, audit and rollback analyzed explicitly;
- unit test for pure behavior and counterexample;
- API integration test for authorization, stale/retry and persistence where applicable;
- contracts/client test for wire changes;
- UI component test for states and errors;
- browser test only for a material public workflow;
- manual verification step named when automation cannot establish usability or infrastructure behavior;
- documentation and archive/compatibility impact included;
- no AI behavior/configuration change in this non-AI program.

## External/manual evidence queue

These are not unfinished implementation tickets. They require credentials, hosted infrastructure, legal/security reviewers, devices, or actual groups.

| ID | Evidence task | Owner/input required | Acceptance artifact | Blocks |
| --- | --- | --- | --- | --- |
| X01 | Run repeated internal and invited GM/player sessions | At least two representative internal groups, invited external groups, and session observer | Session logs, abandonment/correction/conflict outcomes, regression links, no database repair | Internal Playable (internal evidence); Private Alpha (invited evidence) |
| X02 | Live OIDC and SCIM sandbox | Provider tenant/credentials and operator | Login/link/provision/deprovision/role evidence with no privileged auto-link | Private Alpha if offered |
| X03 | Hosted backup/restore, forward migration and rollback | Chosen hosting/storage topology | Timestamped non-no-op campaign+asset restore and rollback report | Private Alpha/Public Beta |
| X04 | Manual accessibility/browser/device matrix | NVDA, Narrator, VoiceOver, TalkBack; Edge/Firefox/Safari; physical touch devices | Completed checklist with zero blocking issue or tracked remediation | Private Alpha/Public Beta |
| X05 | Hosted HTTPS/capacity/observability | Deployed environment, log/metric/trace access | Readiness/asset/websocket smoke, operating envelope and alert/incident evidence | Private Alpha/Public Beta |
| X06 | Content provenance/legal release review | Release owner or counsel | Approved SRD attribution/content inventory and distribution boundary | Public Beta |
| X07 | Independent security review | Qualified external reviewer | Findings report with Critical/High closure or accepted documented risk | Public Beta |

## Definition of complete

The code backlog is complete only when the consolidated validation marker in [FEATURE_AUDIT.md](FEATURE_AUDIT.md) contains the final green command record and no code-addressable P0-P3 regression remains. A stage is complete only when its external queue items are also evidenced. Neither condition authorizes publication or deployment by itself.
