# D&D 5.5e Rules Audit

> Post-remediation audit, 2026-07-14. Scope is the D&D 5.5e SRD 5.2.1 mechanics and user-supplied/homebrew content implemented by this repository. This document describes concepts and behavior without reproducing substantial rules text or assuming access to proprietary D&D content.

## Rules verdict

The engine now has a coherent, server-authoritative D&D rules architecture for the audited campaign loop. It supports reviewed character creation and progression, rolls, HP/temp HP/death state, typed damage defenses, rests, conditions and immunity, attunement, spell preparation/resources, effects and concentration, initiative/combat lifecycle, monster resources, rewards, controlled creatures, and inspectable manual overrides. Consequential actions are prepared, reviewed, revision-checked, idempotent, audited, and reversible where the transaction type supports undo.

The earlier dangerous cases were successful-looking mutations that stored a wrong result: class advancement, ASI/feat scheduling, rest recovery, temporary HP, immunity, attunement, concentration cleanup, and synthetic combat entry. Those paths now have explicit regression coverage. No known code-addressable P0-P3 rules defect remains in the audited scope after the consolidated validation gate.

This does not mean every possible D&D exception is automatically resolved. Ambiguous spell prose, guessed geometry, bespoke homebrew, unsupported proprietary content, and table rulings remain manual or advisory by design. The product is trustworthy when it either computes a typed case or tells the DM why it will not silently mutate state.

## Source of truth and architecture

| Concern | Source of truth | Evidence |
| --- | --- | --- |
| Persisted character/creature/item state | Campaign actor/item records in the API store, with versioned D&D validation | `packages/core/src/types.ts`; `packages/core/src/state.ts`; `packages/system-sdk/src/dnd-validation-preview.ts` |
| Derived calculations | Pure `@open-tabletop/system-sdk` resolvers over persisted records and active items/effects | `packages/system-sdk/src/index.ts`; `dnd-calculation-explanations.ts`; `dnd-rules-completion.ts` |
| Consequential mutation | Server-owned prepared transaction with exact revisions, idempotency, permission, resolution hash, audit, and optional undo | prepared D&D routes in `apps/api/src/app.ts`; `apps/api/src/p0-core-loop-integration.test.ts` |
| Roll authority | Server-side dice evaluation with visibility, formula terms, source attribution, and chat/history record | API roll routes; `packages/dice-engine`; `apps/web/src/chat-presence-dice.test.tsx` |
| Combat state | Combat record plus synchronized actor/combatant lifecycle mutations | `apps/api/src/dnd-typed-damage-combat.ts`; `apps/api/src/typed-damage-combat-sync.test.ts` |
| Temporary effects | Sourced instances with target, duration, concentration link, expiry/replacement/cleanup metadata | `packages/system-sdk/src/dnd-effect-lifecycle.ts`; API effect lifecycle tests |
| Class/content data | D&D SDK static records and user/campaign compendium records with provenance/version/license metadata | `packages/system-sdk/src/dnd-static-content.ts`; `CONTENT_NOTICE.md`; compendium tests |
| Overrides | Reasoned, permission-checked, audited campaign/actor calculation or recovery exception | `apps/api/src/calculation-override-routes.ts`; `condition-mutation-safety.test.ts`; `attunement-api.test.ts` |

The API, not the React client, decides the result of a consequential rules mutation. The client can request a preview, collect choices, and confirm the exact prepared result. Generic actor/item patch routes cannot rewrite rules-managed roots without the dedicated transaction or a documented manager override.

## Concept coverage

Statuses use **Automated**, **Supported/manual**, **Data + UI**, **Advisory**, or **Deliberately bounded**. “Supported/manual” is intentional when reliable automation would require a DM ruling.

### Core character and creature statistics

| Concept | Status | Current behavior and evidence |
| --- | --- | --- |
| Ability scores/modifiers | Automated | Derived by the system SDK and exposed in sheet actions/calculation explanations (`packages/system-sdk/src/index.ts`; `actor-sheet-data.ts`) |
| Proficiency bonus | Automated | Level-aware calculation used by attacks/checks/saves and traced calculations |
| Saving throws and skills | Automated | Class/species/background choices feed server roll options; proficiency/expertise and roll mode are sourced |
| Armor Class | Automated with override | Equipped/attuned item state and class features participate; campaign managers can create reasoned calculation overrides |
| HP and maximum HP | Automated | Constitution/class advancement, healing/damage, reduced-max recovery, and exact deltas are regression-tested |
| Temporary HP | Automated | Separate pool, absorbs damage before HP, does not stack as healing, and clears/reconciles on the modeled rest lifecycle |
| Hit Dice | Automated with player choice | Per-class pools and selected Short Rest expenditure/rolls; Long Rest recovery follows the implemented 5.5e schedule |
| Speed and movement types | Data + UI | Walk and typed movement/senses are stored and shown; tactical geometry does not silently rewrite speed |
| Initiative | Automated or manual entry | Server rolls or accepts reviewed values; ties/order and hidden participants are reviewed before combat starts |
| Passive scores | Automated | Derived and explainable where exposed by actor calculations |
| Exhaustion | Automated | Leveled condition state, effects, and Long Rest interactions covered by rules tests |
| Heroic Inspiration | Automated | Grant/spend state and roll interaction represented in D&D completion helpers |
| Death saving throws | Automated | Success/failure/stabilization/death lifecycle; critical damage at zero causes the modeled additional failures |
| Size and creature type | Data + UI | Creator, actors, monsters, transformations, and controlled creatures preserve these properties |
| Senses | Data + UI | Darkvision, blindsight, truesight, tremorsense, light/darkness and token vision are typed; exceptional perception remains a DM ruling |
| Languages | Data + UI | Declared level-one choice graph plus custom records; duplicate/required choices validated |
| Level and experience | Automated | XP thresholds, party awards, milestone/manual advancement path, revisioned history |

### Defenses, conditions, and damage

| Concept | Status | Current behavior and evidence |
| --- | --- | --- |
| Damage types | Automated | Typed components are resolved independently; mixed damage preserves per-component defenses and rounding |
| Resistance/immunity/vulnerability | Automated | Actor, monster-trait, active/equipped/attuned item sources are included and explained (`dnd-rules-completion.ts`; typed-damage tests) |
| Condition immunity | Automated with reasoned manager override | Actor, monster, effect, and active attuned item sources block normal application; override permission/reason/audit tested |
| Conditions | Automated | Add/remove, levels, source, durations and effect interactions; generic-system paths remain separate |
| Critical hits | Automated | Damage formula transformation and zero-HP death-save consequences are tested |
| Multiple targets and save-for-half | Automated when typed | Reviewed per-target amounts and revisions apply atomically; one stale/unauthorized target cancels the batch |
| Healing and stabilization | Automated | HP cap, zero-HP recovery/stabilization and death-state cleanup use prepared actions where consequential |
| Ambiguous damage prose | Supported/manual | Preview returns an unsupported/manual result and makes no HP change rather than guessing a type or exception |

### Character creation and advancement

| Concept | Status | Current behavior and evidence |
| --- | --- | --- |
| Species/ancestry | Automated choice graph | Declared SRD options, traits, size/speed/languages and variant choices; focused creator fixtures |
| Backgrounds and origin feats | Automated choice graph | Background ability increases, skills/tools/equipment and origin-feat selection validated |
| Classes | Automated choice graph | Class skills, equipment alternatives, resources, spells and Weapon Mastery choices are class-aware |
| Subclasses | Automated at class schedule | Eligible choices appear at the correct class level and are not silently defaulted |
| Feats and ASI | Automated at class schedule | Fighter 6/14 and Rogue 10 class-specific grants plus general/epic-boon eligibility are regression-tested (`feat-eligibility.test.ts`; `feat-eligibility-api.test.ts`) |
| Constitution HP | Automated | Advancement applies the current modifier and reconciles maximum/current HP without the prior illegal fixed gain |
| Multiclassing | Automated within declared classes | Eligibility, class levels, hit dice, proficiency boundaries and multiclass spell slots are modeled; custom class profiles can supply data |
| Weapon Mastery | Automated choice/storage | Class-aware count/eligibility and creator/advancement selections; action metadata exposes mastery |
| Reviewed character state | Automated policy | Optional-by-default campaign review, fingerprint, approve/change request/override, token/combat gates |
| Pending advancement | Durable workflow | Incomplete and ready drafts persist through reload, SQLite restart, actor switch, and archive round trip; cancel is explicit |
| Imported characters | Validated + reviewable | Versioned validation/repair preview preserves unknown fields and reports issues; external proprietary formats are not implied |

### Spellcasting and resources

| Concept | Status | Current behavior and evidence |
| --- | --- | --- |
| Spell records | Data + UI | Level, school, time, range, components, duration, attack/save, damage/healing, concentration, ritual and source metadata where supplied |
| Known/prepared/always-prepared | Automated | Class-aware state and dedicated preparation mutation; direct patch escape hatch closed |
| Spellbooks | Automated within modeled classes | Wizard spellbook/preparation separation and ritual availability are explicit (`dnd-spell-preparation.ts`) |
| Spell slots | Automated | Class and multiclass progression, spend/recovery and advancement reconciliation |
| Pact Magic | Automated | Separate resource model and Short Rest recovery rather than conflating it with normal slots |
| Innate/item casting | Data + typed actions | Item/actor actions can carry their own use/resource/attunement prerequisites |
| Concentration | Automated | One active source, replacement, damage checks, source-linked effect cleanup and incapacitation/end paths |
| Rituals | Automated eligibility | Ritual metadata and Wizard spellbook behavior are modeled; casting-time table adjudication stays visible |
| Upcasting/scaling | Automated when data-backed | Slot/level scaling helpers and sourced previews; prose-only exceptions remain manual |
| Summoning/transformation/teleportation | Typed preview/confirm or manual | Controlled-creature and transform lifecycles are modeled; open-ended placement/range/prose decisions stay DM-controlled |
| Reaction/bonus-action spells | Data + combat action | Action economy metadata and reaction tracking are exposed; the engine does not claim to parse arbitrary spell text |
| Scrolls/crafting | Deliberately bounded | Scroll/item metadata and item-casting actions are supported where data-backed; no general crafting-time, formula, ingredient, cost, downtime, or campaign-economy automation is claimed, so those decisions remain DM-controlled |

### Combat, movement, and effects

| Concept | Status | Current behavior and evidence |
| --- | --- | --- |
| Action/bonus action/reaction | Automated tracking | Typed action metadata, resource use, reaction state and turn lifecycle |
| Opportunity attacks | Supported/manual + advisory | Movement/path tools can expose the trigger context; target/reaction and exceptional reach remain confirmed by a user |
| Surprise | Reviewed combat setup | Participant state is reviewed before first turn rather than inferred from hidden client data |
| Cover | Advisory | Directional manual-cover UI records the ruling; geometry never silently changes AC or a save |
| Difficult terrain | Advisory | Measurement/path summary helps the DM; no unreliable pathfinding/collision enforcement |
| Advantage/disadvantage | Automated | Roll modes, condition/effect sources, cancellation and transparent formula details |
| Reactions/readied actions | Data + manual declaration | Reaction use can be tracked; readied trigger interpretation remains a table ruling |
| Legendary/lair/regional actions | Automated lifecycle | Resource/timing records and advanced mechanics helpers are available to monster operators |
| Recharge and limited uses | Automated | Recharge rolls, spend/recovery and action availability are tracked |
| Ongoing/scheduled effects | Automated | Start/end timing, duration, saves, expiry, cleanup and stale-safe commit/undo |
| Area templates/targets | UI + typed batch | Circle/cone/line targeting and multi-target previews; collision/line-of-effect exceptions remain manual |
| Encounter completion/rewards | Automated workflow | End state, XP/GP/loot, claim/assignment and durable reward history are revisioned/idempotent |

### Items, equipment, and controlled creatures

| Concept | Status | Current behavior and evidence |
| --- | --- | --- |
| Weapons/armor/shields/properties | Data + automated calculations | Equipped state gates benefits/actions; mastery and ammunition metadata participate |
| Attunement | Automated | Capacity, prerequisites, active effects, exact actor/item revisions, permission and audit |
| Cursed unattunement | Automated manager recovery | Normal unattunement is blocked; a campaign actor manager can provide a non-empty reason to break the curse, which is audited |
| Charges/recharge/consumables | Automated | Use limits and recovery are typed; direct inventory root edits are guarded |
| Containers/weight/encumbrance | Automated | Cycle/depth checks, contained weight, party stash and transfer flows |
| Currency/commerce/loot | Automated workflow | Buy/sell, merchant stock, party loot, claims/assignment, audit and persistence |
| Summons/companions/familiars/pets | Typed lifecycle | Preview/confirm/command/end, ownership, concentration link and combat/scene integration |
| Transformation/shape-changing | Typed lifecycle | Source and reversible state are captured; bespoke form exceptions can remain manual |

## Character calculation findings

Calculations are derived from actor data, eligible active items, effects, class profiles, and campaign overrides. The UI can show sources rather than only a total (`packages/system-sdk/src/dnd-calculation-explanations.ts`; `apps/web/src/calculation-explanation-panel.tsx`). The calculation compatibility endpoint reports system/content/version mismatches rather than silently accepting incompatible data.

Important invariants now covered include:

- current HP never exceeds the reconciled maximum after advancement/rest/effect cleanup;
- reduced maximum HP is restored before a full Long Rest heal and the reported recovery delta is the actual HP change;
- temp HP is not ordinary healing and is consumed before HP;
- inactive, unequipped, unattuned, ineligible, duplicate, or exhausted item benefits do not contribute;
- class-specific feature/feat/subclass/resource schedules are selected from the actor's class profile;
- imported/legacy unknown fields are retained while invalid managed roots are reported or repaired through preview;
- raw actor/item patches cannot bypass rules-managed transactions without a reasoned manager override.

## Remediated incorrect automation

The rows below describe verified pre-remediation defects and their current disposition. Each was definitely incorrect for the representative modeled case, not merely a style preference.

| Rule concept | Previous behavior and consequence | Current response | Evidence |
| --- | --- | --- | --- |
| Class advancement and Constitution HP | A generic level step could grant the wrong HP/features | Class profile, current Constitution modifier, selected choices and exact revision drive a prepared commit | `packages/system-sdk/src/index.ts#dnd5eSrdClassAdvancementProfile`; `p0-rules.test.ts` |
| ASI/feat/subclass schedules | Global/default choices could skip or auto-grant an illegal option | Class-aware schedules and explicit durable choice review; no silent default | `#dnd5eSrdAdvancementFeatGrant`; `feat-eligibility-api.test.ts` |
| Short Rest | Hit Dice could be spent without player selection/roll | Preview accepts selected class dice and server rolls; confirmation commits exact result | `dnd-validation-preview.ts`; API/web rest tests |
| Long Rest | Recovery and cleanup were incomplete | Correct HP/max/temp/death/exhaustion/resource/hit-die lifecycle with actual deltas | `index.ts#dnd5eSrdRestRecovered`; `p0-rules.test.ts` |
| Typed damage | Direct damage could bypass temp HP or defenses | Per-component typed resolution, target/item revisions, atomic application and combat sync | `dnd-rules-completion.ts`; `typed-damage-combat-sync.test.ts` |
| Condition immunity | A supposedly immune actor could receive the condition | All modeled immunity sources block application; explicit manager reason is required to override | `condition-mutation-safety.test.ts` |
| Attunement/curses | Inactive item effects or unrestricted cursed unattunement could persist | Benefits require state/prerequisites; cursed removal is blocked except audited manager recovery | `attunement-p0.test.ts`; `attunement-api.test.ts` |
| Concentration/effect cleanup | Effect and concentration state could drift apart | Source-linked lifecycle replaces, expires, ends and cleans related effects atomically | `dnd-effect-lifecycle.ts`; effect lifecycle tests |
| Combat entry | Synthetic/default initiative could start an incomplete encounter | Reviewed participant readiness, server/manual initiative and explicit order/tie review | `combat-start.test.ts`; `combat-setup.ts` |
| Zero HP and critical damage | Actor/combatant/death-save state could disagree | Typed damage synchronizes actor and active combatant in one revisioned transaction | `dnd-typed-damage-combat.ts`; sync tests |

## Homebrew and DM override policy

The engine must remain usable when a table deviates from strict SRD behavior. It therefore separates four cases:

1. **Valid typed automation:** preview shows sources/result; confirmation commits it.
2. **Invalid state:** validation blocks commit and explains the issue.
3. **Ambiguous or unsupported exception:** preview is non-mutating and asks for manual adjudication.
4. **Intentional exception/recovery:** an authorized campaign manager supplies a bounded reason; the server audits who changed what and preserves compatibility metadata.

Campaign-scoped builders support custom monsters, spells, items, feats, species, backgrounds, subclasses, and conditions (`dnd-custom-content.ts`, `dnd-custom-content-api.test.ts`, and `dnd-custom-content-panel.tsx`). Campaign rules profiles, calculation overrides, custom class profiles, unknown-field preservation, compendium provenance, and archive conflict handling prevent “homebrew support” from becoming an untraceable raw JSON patch.

## Hard-coded and data-driven boundaries

Data tables are appropriate for stable SRD identifiers, class schedules, XP/ASI progression, conditions, damage types, encounter thresholds, and attunement keys; these were extracted to `dnd-static-content.ts` with dependency-boundary tests. Pure resolvers implement stacking, resource, damage, rest, advancement, and lifecycle behavior. Server routes own transaction/security concerns. UI code owns presentation and choice collection.

Some class/action helpers remain explicit TypeScript rather than a universal expression language. That is an accepted narrow architecture: D&D's exception-heavy design benefits from typed, tested functions and campaign override seams more than an unproven generic rules DSL. New mechanics should be added as focused data plus a pure resolver and prepared transaction only when actual product scope requires them.

## Remaining manual or bounded rules

These are not silent failures and are not current release blockers when the product boundary is clear:

- arbitrary natural-language spell, feat, monster, item, or homebrew exceptions;
- inferred cover, collision, difficult-terrain pathfinding, line of effect, and opportunity-attack geometry;
- proprietary non-SRD content not supplied and licensed by the user;
- open-ended illusion, social, exploration, negotiation, and narrative adjudication;
- bespoke timing conflicts that require a DM ruling;
- automation for every published class/subclass/spell/item outside the shipped SRD/user-content scope.

The engine should not “solve” these by guessing. It should preserve the roll, sources, targets, user decision, and resulting manual state change where applicable.

## Rules-engine architecture risk disposition

This rules audit and [ARCHITECTURE_RISKS.md](ARCHITECTURE_RISKS.md) use the same release boundary. The rows below identify the architecture risks with direct rules/data consequences; "mitigated" means the known code counterexample is closed, not that regression or operational evidence is impossible.

| Risk | Rules-engine consequence | Current disposition | Release impact |
| --- | --- | --- | --- |
| AR-01 | A successful-looking advancement, rest, damage, condition, attunement, effect, or combat mutation can store the wrong authoritative result | Critical / mitigated in code with prepared transactions and counterexample regressions | Any reopened counterexample blocks real play and public release until fixed and covered |
| AR-03 | Invalid or internally inconsistent actor/item/combat records can survive archive restore and poison later rules calculations | Critical / mitigated in code with version/domain/reference/checksum validation before mutation | A validation or non-no-op round-trip regression blocks release; target-host restore evidence is tracked with AR-19 |
| AR-05 | A correct calculated result can be acknowledged but disappear after restart, making the rules history and current state disagree | Critical / mitigated in code within the SQLite topology through serialized, commit-safe persistence and retry tests | A durability regression blocks real play and release; production storage telemetry remains a hosted gate |
| AR-13 | Concentrated API/web/SDK composition roots make it easier to update a rule in one layer but omit its transaction, UI, or regression path | High / residual and budgeted; coherent routes, panels, static data and pure resolvers are extracted incrementally | Does not block the current stage while budgets and full suites pass; a budget or behavior regression blocks release |
| AR-18 | A mechanically valid spell, monster, item, or other content record may still lack lawful provenance or make official/homebrew/generated origin unclear | High / evidence-gated with per-record provenance and package notices implemented | Does not block private play with lawful user content; blocks public distribution until release-owner/legal approval |
| AR-19 | Local migration/backup success may not preserve rules state and referenced assets on the actual hosted storage topology | Critical / evidence-gated; local golden/current fixtures and coordinated restore/rollback exist | Blocks hosted/public release until a forward migration, non-no-op restore, asset verification and rollback are recorded |

## Rules verification matrix

| Layer | Representative evidence |
| --- | --- |
| Pure rules | `packages/system-sdk/src/p0-rules.test.ts`, `dnd-combat-progression.test.ts`, `dnd-advanced-mechanics.test.ts`, `spell-preparation.test.ts`, `attunement-p0.test.ts`, `feat-eligibility.test.ts` |
| Shared state | `packages/core/src/dnd-rules-mutation-state.test.ts`, pending advancement and compatibility tests |
| API transactions | `apps/api/src/p0-dnd-api.test.ts`, `p0-core-loop-integration.test.ts`, `advanced-dnd-mechanics.test.ts`, `typed-damage-combat-sync.test.ts`, `condition-mutation-safety.test.ts`, `attunement-api.test.ts` |
| Contracts/client | `packages/api-contracts/src/index.test.ts`, `packages/api-client/src/prepared-dnd-mutations.test.ts` |
| Web | actor loadout, advancement, spell preparation, condition, attunement, typed damage, combat setup and advanced mechanics tests in `apps/web/src` |
| Browser | D&D creator/session/combat/restart/archive journeys in `tests/e2e/browser-evidence.spec.ts` and `auth-tabletop.spec.ts` |

Exact consolidated command results are recorded in [FEATURE_AUDIT.md](FEATURE_AUDIT.md) and `docs/verification/non-ai-audit-remediation-2026-07-13.md`.

## Rules-related release gates

### Code gates

- Full SDK/core/API/contracts/client/web tests and builds pass.
- No successful-looking mutation violates the covered rules invariants.
- Every consequential rules endpoint enforces permission, exact revision, idempotency, request/response schema, and audit.
- Archive/restart round trips preserve reviewed actor/item/combat state.

### External gates

- Real DMs run repeated sessions and record exceptional rulings, corrections, and abandonment points.
- Content/release owner verifies the shipped SRD version, attribution, and absence of unauthorized proprietary content.
- Any code regression discovered in those sessions receives a focused counterexample test before the stage advances.

No AI behavior change is part of these rules gates. The current agent may use manual proposals or governed automatic execution according to campaign policy and the invoking user's authority.
