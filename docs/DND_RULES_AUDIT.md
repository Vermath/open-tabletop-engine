# D&D 5.5e Rules Audit

## 2026-07-17 rules-remediation closure addendum (authoritative)

This addendum supersedes conflicting 2026-07-16 rules verdicts while retaining the earlier defect analysis. The current uncommitted tree closes every code-addressable rules defect identified by that audit without claiming automation for intentionally adjudicated D&D play.

### Current rules verdict

The reviewed D&D 5.5e foundation is now **correct on the automated paths covered by the audit and regression suites**. Attack criticals carry an authoritative critical verdict into typed damage; healing and death-save recovery project coherently into combat; action/resource activation metadata agrees across SDK, API, and sheet; creation and advancement preserve legal score, class, subclass, spell-grant, casting-ability, speed, and provenance semantics.

| Rules area | Closure |
|---|---|
| Attack, critical, damage, resistance, temp HP | Typed preview-to-commit continuity, server-side critical dice transformation, replay/undo/idempotency coverage, and combat-panel controls are connected. |
| Zero HP, death saves, healing, combat defeat | Actor and combatant life state now synchronize in both directions and survive reconnect/reload. |
| Actions and resources | Second Wind, Tactical Mind, Action Surge, Rage, Bardic Inspiration, Stunning Strike save gates, and legendary-action cadence have explicit activation/economy coverage. |
| Creation | Standard-array assignment is a server-validated permutation with background boosts, derived preview, committed provenance, and resumable account/campaign-scoped drafts. |
| Advancement and spellcasting | SRD casting classes use typed acquisition/grant-source/casting-ability metadata; multiclass and negative fixtures prevent primary-class fallback. |
| Derived character state | Effective movement reacts to class prerequisites and equipment; explicit subclass selection wins over stale/imported feature names. |
| Persistent state | The selected managed-effect/concentration lifecycle is authoritative and recoverable; broader complex spell effects remain explicitly manual. |

### Final exact-tree rules evidence

The final local tree passed the complete System SDK rules suite (38 files, 305 tests), the API suite (131 files, 807 passed with 1 intentional skip), the 62-case aggregate browser suite, the canonical blank-deployment GM/player journey, and the generated-map/four-character full Level 3 combat journey. The browser runs exercised strict creator and advancement choices, attack-to-damage continuations, typed damage, conditions, concentration, death saves, healing/recovery, rests, initiative, permissions, restart/resume, and archive continuity. This supports the verdict above for the audited automated paths; it does not expand the deliberate adjudication boundary below.

### Deliberate adjudication boundary

Geometry-derived cover, stealth rulings, improvised actions, complex spell text, arbitrary homebrew interactions, and every possible persistent effect remain DM-adjudicated unless a typed resolver explicitly says otherwise. That is a product boundary, not a hidden claim of full automation. X01 real-table evidence, X04 physical accessibility evidence, X06 content/legal approval, and X07/X08 independent security/AI review remain open.

## 2026-07-16 working-tree rules addendum (authoritative)

This addendum controls where it conflicts with the 2026-07-15 ledger below. The cutoff is committed HEAD `9de6a3c` plus the current uncommitted tree. The canonical rules reference is the Creative Commons [SRD 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf); this audit paraphrases rule concepts and does not reproduce rules text.

### Current rules verdict

The engine has a credible, unusually broad D&D 5.5e SRD foundation: core rolls, typed damage, defenses, conditions, concentration, rests, resources, inventory, action economy, provenance, and hundreds of spells and monsters are represented. It is **not rules-credible for alpha yet** because a successful critical attack can apply ordinary damage and because healing an actor during active combat can leave the combatant defeated. Character creation, multiclass spell attribution, movement features, subclass gating, persistent spell effects, and legendary cadence are partial.

The prior ledger's Second Wind and Tactical Mind issues are implemented in the dirty tree and pass focused tests, but are not released. The prior Aasimar concern is closed as **not a defect**: Aasimar does not appear in the official SRD 5.2.1 corpus, so its absence is consistent with an SRD-only product.

### Coverage summary

| Rules domain | Verdict | Evidence-based interpretation |
|---|---|---|
| Ability checks, saves, skills, and initiative | Working | Shared modifiers and roll provenance are authoritative on the exercised paths. |
| Armor Class and basic defenses | Working | Armor/shield/unarmored calculations have structured coverage. |
| Attack rolls and hit determination | Partial | Natural results are identified, but the critical outcome is lost before damage. |
| Damage, resistance, immunity, vulnerability, and temporary HP | Working with critical blocker | Typed damage is strong; critical dice are the material exception. |
| Zero HP, death saves, stabilization, and healing | Blocked in active combat | Actor normalization works; combatant recovery synchronization does not. |
| Conditions and concentration | Working on core paths | Centralized state and cleanup are strengths; complex spell-specific riders remain manual. |
| Turns, rounds, actions, Bonus Actions, Reactions, and resources | Working on focused paths | Current action-economy suites pass. Persistent once-per-turn and interrupt timing still need broader modeling. |
| Short/Long Rests and Hit Dice | Working | Resource restoration and hit-die use are represented with tests. |
| Inventory, equipment, attunement, and encumbrance-adjacent state | Working/partial | Core equipment and attunement work; ammunition and richer carried-state enforcement remain incomplete. |
| Level-1 character creation | Partial | Class/species/background/origin selection exists without a complete ability-score allocation method. |
| Advancement and multiclassing | Partial | Core level changes exist; spell acquisition and casting-ability attribution are narrow. |
| Class and subclass features | Partial | Many features exist, but movement bonuses and Open Hand gating show that feature ownership is not consistently authoritative. |
| Spell catalog and casting | Partial | 341 spells are represented; 250 generate an action, 91 do not, and 141 generated actions use a zero formula as a marker for manual/non-damage handling. |
| Monsters and encounter rules | Working/partial | 313 monster threats provide broad encounter coverage; complex legendary and persistent mechanics remain prototype-level. |
| Content provenance and homebrew boundaries | Strong | SRD provenance and extensibility boundaries are explicit and should be preserved. |

### Explicit supported, partial, unsupported, and manual rules inventory

This matrix disposes the rules concepts requested by the brief. "Automated" means the authoritative path was traced or exercised; "represented" means structured data exists but every downstream rule was not proven.

| Concept | Verdict | Current behavior and evidence anchor |
|---|---|---|
| Ability scores and modifiers | Automated on core paths | Derived in `packages/system-sdk/src/index.ts`; creator still lacks a complete allocation method (R-11). |
| Proficiency bonus | Automated | Central level-based derivation in System SDK and sheet quick-roll generation. |
| Saving throws and skills | Automated on core paths | Shared roll/modifier path; save Advantage covered by `dnd-save-advantage.test.ts`. |
| Armor Class | Automated with explicit intent/override support | `packages/system-sdk/src/dnd-armor-class-intent.ts`; migration/actor mutations call the derivation. |
| Hit points and temporary hit points | Automated except combat recovery projection | Typed damage/healing/temp-HP transitions work; R-09 is the active-combat synchronization defect. |
| Hit Dice | Automated on reviewed rests/multiclass paths | System SDK tracks/restores per-class pools; broader imported/homebrew matrices not exhaustively run. |
| Speed and movement types | Represented; partially incorrect | Base/movement data exists, but `dnd5eSrdSpeed` ignores Monk/Barbarian grants (R-12). |
| Initiative and passive scores | Automated on core paths | Initiative is server-resolved and combat-connected; passive/quick values derive in System SDK. |
| Exhaustion | Automated on represented core path | Exhaustion and rest recovery are represented in `packages/system-sdk/src/index.ts`; every interaction was not exhaustively verified. |
| Heroic Inspiration | Automated | Grant/overflow transfer/reroll routes in `apps/api/src/app.ts` and prior live evidence. |
| Death saving throws, stabilization, and death | Automated but broken on healing projection | Actor transition/death-save reset works; combatant defeat can remain stale (R-09). |
| Conditions and condition immunity | Automated/represented | Typed conditions and monster immunities exist; complex stacking/duration exceptions remain partial. |
| Damage types, resistance, immunity, vulnerability | Automated on typed paths | Central typed-damage resolution is covered by System SDK/API tests; critical dice remain broken. |
| Senses (darkvision, blindsight, truesight, tremorsense) | Represented; map enforcement partial | Creature/token sense data and vision surfaces exist; every magical-darkness/sense interaction was not verified. |
| Languages, size, and creature type | Represented | Structured actor/monster/content fields exist; these are primarily descriptive/eligibility data. |
| Level and experience | Automated/represented | Level/advancement and XP/reward data exist; spell acquisition breadth is partial. |
| Classes | Functional but incomplete | Twelve SRD classes were found; common resources/actions exist, but feature depth is uneven. |
| Subclasses | Functional but incomplete | Selected-subclass data exists; Open Hand is incorrectly inferred for every level-3 Monk (R-13). |
| Backgrounds | Represented/creator-connected | Four SRD backgrounds found; boosts connect to creator, but base ability allocation is incomplete. |
| Species | Represented/creator-connected | Nine SRD species found; Aasimar is correctly absent from SRD 5.2.1. |
| Feats and origin feats | Functional but incomplete | Six origin feats found and feature grants exist; full prerequisite/choice/override breadth was not exhaustively verified. |
| Ability Score Improvements | Functional but incomplete | Advancement supports ability changes, but complete feat-versus-ASI and every-class choice matrices were not proven. |
| Multiclassing | Functional but incomplete | Class levels, hit-die pools, and Pact Magic distinctions exist; spell grant source/ability can be wrong (R-10). |
| Spellcasting | Functional but incomplete | Slots, attacks, saves, concentration, preparation-related data, and casting actions exist; class-complete acquisition and complex effects do not. |
| Pact Magic / alternate slot models | Functional but incomplete | Separate Warlock pact-slot semantics are represented; all multiclass casting combinations were not exhaustively verified. |
| Weapon Mastery | Automated on reviewed properties | `packages/system-sdk/src/dnd-weapon-mastery.ts` models the eight reviewed properties; geometry-dependent Push remains reviewed/manual. |
| Attunement and equipment state | Automated/represented | Inventory graph and attunement rules exist; ammunition, containers, party transfer, and duplicate-effect breadth are partial. |
| Short and Long Rests | Automated on reviewed paths | Resource recovery and Hit Dice paths are in System SDK focused tests. |
| Concentration | Automated on core paths | Start/check/end/cleanup are authoritative; spell-specific persistent lifecycle remains partial. |
| Actions, Bonus Actions, and Reactions | Automated on focused paths | Action-economy ledger works; dirty-tree Second Wind/Tactical Mind fixes pass focused tests but are unreleased; reaction timing UX is partial. |
| Opportunity attacks and readied/interrupt timing | Manual/prototype | No complete automatic movement-trigger/interrupt engine was found; DM adjudication is safer than inferred geometry. |
| Cover and difficult terrain | Manual/prototype | Tactical/map aids exist, but direct drag is not authoritative rules enforcement. |
| Advantage and disadvantage | Automated on reviewed rolls | Shared d20 mode/provenance path exists; every temporary stacking source was not exhaustively verified. |
| Critical hits | Definitely incorrect | Hit logic sees the d20 result, but damage continuation loses the critical verdict (R-08). |
| Temporary and persistent effects | Functional but incomplete | Typed conditions/concentration exist; no general lifecycle covers repeated areas, summons, transformations, and turn-boundary effects. |
| Limited-use features and resource recovery | Automated on focused paths | Resource spends/rest recovery are connected; current action-kind corrections remain unreleased. |
| Recharge mechanics | Represented/partially automated | Monster actions/data carry recharge behavior, but no broad recharge E2E matrix was completed. |
| Legendary and lair actions/regional effects | Prototype/partial | Lair/regional scheduling exists; dedicated legendary between-turn use economy remains incomplete. |
| Summoned creatures | Manual/partial | Controlled-creature primitives exist; spell-specific summon stat/lifecycle automation is not complete. |
| Transformation and shape-changing | Manual/partial | No general reversible transformation layer was verified; use explicit/manual actor changes and audit/undo. |
| Companions, familiars, pets, controlled creatures | Functional but incomplete | Typed controlled-creature handoff exists in `packages/system-sdk/src/dnd-controlled-creatures.ts`; familiar/companion creation and spell lifecycle remain uneven. |
| Spells with persistent, world-changing, or ambiguous outcomes | DM adjudication | Teleportation, illusions, summons, transformations, servants/familiars, and similar effects should remain manual unless a narrow typed lifecycle is implemented and labeled. |
| Homebrew content and manual overrides | Flexible with guardrails | Calculation overrides, custom content/provenance, and preservation of unknown import fields support deviation; use explicit grants rather than string inference. |

#### Catalog count definitions

The current inspection found **341 normalized spell records**, of which 250 generate an action, 91 do not, and 141 generated actions carry a zero formula used by manual/non-damage behavior. It also found **313 monster threat records**. "Threat record" is not the same unit as the historical ledger's "168 stat blocks," and the historical "about 342 school-tagged spells" came from an older snapshot/query. The current counts above control; they do not imply 313 unique monster stat blocks or full automation for 341 spells.


### Status corrections to the prior ledger

| Finding | 2026-07-16 status | Evidence |
|---|---|---|
| R-04 Second Wind use count | Implemented in working tree, unreleased | Current focused action-economy tests pass; treat as closed only after the tranche is committed and the aggregate gate is stable. |
| R-05 Tactical Mind expenditure timing | Implemented in working tree, unreleased | The new continuation preserves the resource until a failed check is actually improved; focused tests pass. |
| R-06 possible missing Aasimar | Closed, not a defect | The official SRD 5.2.1 PDF contains no Aasimar entry. Do not add non-SRD content merely to satisfy a mistaken parity assumption. |

### R-08 - Critical attack damage is not propagated

1. **Rules concept:** A critical attack changes the damage dice rolled, and expanded critical ranges must use the attacker's feature-specific threshold.
2. **Current product behavior:** Attack resolution recognizes a natural d20 result for hit logic, but the continuation stores no critical flag, natural roll, or threshold. Damage resolution therefore uses the ordinary formula.
3. **Code evidence:** `packages/system-sdk/src/dnd-action-continuations.ts` constructs the post-hit damage continuation without critical metadata. `packages/system-sdk/src/dnd-rules-completion.ts` contains `dnd5eSrdCriticalDamageFormula`, but the helper is not connected to the continuation. Champion critical-range metadata in `packages/system-sdk/src/index.ts` is not carried through the attack pipeline.
4. **Gameplay consequence:** Weapon attacks, spell attacks, Sneak Attack dice, and Champion expanded-range criticals can deal ordinary damage. This breaks a frequent, highly visible combat rule and invalidates audit evidence that only checks hit and damage separately.
5. **Verdict:** **Critical correctness defect; Foundation exit blocker and therefore a blocker for every later stage.**
6. **Recommendation:** Add a typed critical outcome to the pure attack resolver and continuation; calculate the applicable threshold server-side; transform only rollable damage dice at commit time; preserve revision/idempotency/undo semantics; add unit, API, and browser tests for weapon, spell attack, Sneak Attack, Champion 19/18, and critical-negating armor.

### R-09 - Healing and active-combat defeat state diverge

1. **Rules concept:** When healing restores a creature above 0 HP, it is no longer in the zero-HP/death-save state and must be eligible to participate unless another condition prevents it.
2. **Current product behavior:** Actor healing correctly clears actor death saves, defeated state, and zero-HP life state. The combat synchronization helper only marks a combatant defeated when the actor reaches 0 HP; it skips already-defeated combatants and never clears combatant defeat or combatant death-save counters.
3. **Code evidence:** Actor normalization is present in `packages/system-sdk/src/index.ts` around the healing transition. `apps/api/src/app.ts` applies the actor update and invokes `syncCombatDefeatedFromActorIds`; that helper only performs the one-way defeated transition.
4. **Gameplay consequence:** The sheet can show a conscious, healed actor while initiative still treats the corresponding combatant as defeated. The DM and player see two authoritative answers to the same game state.
5. **Verdict:** **High-severity state-integrity defect; Foundation exit blocker and therefore a blocker for every later stage.**
6. **Recommendation:** Replace the one-way helper with an explicit actor-to-combatant life-state projection for every affected actor; clear combatant defeat and death-save state on recovery; cover healing, stabilization, damage back to 0, undo, and reconnect in transaction-level and browser tests.

### R-10 - Spell acquisition and casting ability are not class-complete

1. **Rules concept:** Prepared/known spell choices, spell-list eligibility, and spellcasting ability depend on the class granting the spell and on multiclass progression.
2. **Current product behavior:** Authoritative advancement spell-choice validation is limited to a narrow Cleric/Wizard path. Other casters are described as sheet-managed, and spell items can fall back to the actor's primary class rather than the class that granted the spell.
3. **Code evidence:** `packages/system-sdk/src/dnd-validation-preview.ts` restricts the advancement request and validation path. `apps/web/src/advancement-flow.tsx` omits complete choices for other casters. Spell action construction in `packages/system-sdk/src/index.ts` uses fallback attribution when authoritative metadata is absent.
4. **Gameplay consequence:** Bard, Druid, Paladin, Ranger, Sorcerer, Warlock, and multiclass characters can acquire spells outside a validated flow or use the wrong attack/save ability.
5. **Verdict:** **High-severity progression gap; alpha blocker for campaigns using affected classes.**
6. **Recommendation:** Model spell grant source, list, acquisition mode, and casting ability as typed item metadata; validate each class's level transition without building a universal rules DSL; add single-class and multiclass fixtures for every SRD spellcasting class.

### R-11 - Character creation lacks an authoritative ability-score allocation method

1. **Rules concept:** A new character needs a complete, validated assignment of starting ability scores and background adjustments.
2. **Current product behavior:** The creator accepts fixed templates and background boosts but does not provide complete standard-array reassignment, point-buy, or a recorded rolled-stat method.
3. **Code evidence:** Preset arrays live in `packages/system-sdk/src/index.ts`; the API creation request in `apps/api/src/app.ts` does not represent a general base-score allocation; the web creator exposes only the downstream boost choices.
4. **Gameplay consequence:** Players cannot reproduce common legal builds without accepting a preset or editing around the intended creation workflow, and the audit trail cannot explain how base scores were obtained.
5. **Verdict:** **High product/rules completeness gap; required before broad alpha.**
6. **Recommendation:** Ship standard-array assignment first with permutation validation and a clear preview; add point buy only if demanded by the target campaign; record the method and final allocations in provenance; do not add arbitrary formula infrastructure.

### R-12 - Class movement bonuses do not affect effective speed

1. **Rules concept:** Class features can modify a character's movement speed when their prerequisites are satisfied.
2. **Current product behavior:** Fast Movement and Unarmored Movement metadata are granted, but the central effective-speed calculation ignores the class bonuses.
3. **Code evidence:** Feature metadata is created in `packages/system-sdk/src/index.ts`, while `dnd5eSrdSpeed` derives speed without applying those grants.
4. **Gameplay consequence:** Barbarian and Monk sheets, movement aids, and player decisions can use a lower speed than the character actually has.
5. **Verdict:** **Medium rules defect; fix during the first alpha milestone.**
6. **Recommendation:** Make effective speed a pure derived value over species speed, class grants, equipment/armor prerequisites, conditions, and explicit overrides; test Monk and Barbarian thresholds plus armored/unarmored cases.

### R-13 - Open Hand Technique is granted to every level-3 Monk

1. **Rules concept:** A subclass feature applies only when the character selected the subclass that grants it.
2. **Current product behavior:** The Open Hand helper returns true for every Monk of sufficient level instead of checking the selected subclass.
3. **Code evidence:** `dnd5eSrdHasOpenHandTechnique` in `packages/system-sdk/src/index.ts` gates on class and level but not the authoritative subclass selection, unlike nearby selected-subclass helpers.
4. **Gameplay consequence:** Custom or future Monk subclasses receive an unauthorized combat rider and can generate rules-incorrect continuations.
5. **Verdict:** **Medium authorization-by-rules defect.**
6. **Recommendation:** Gate the feature through the same selected-subclass source used elsewhere; add a negative fixture for a non-Open-Hand Monk and preserve permissive homebrew through explicit grants, not class-name inference.

### R-14 - Complex persistent effects remain manual or prototype-level

1. **Rules concept:** Many spells and monster features create ongoing areas, summons, repeated saves, transformations, reactions, or turn-boundary effects rather than one immediate roll.
2. **Current product behavior:** The catalog is broad, but many spells have no generated action or a zero formula, and tactical/legendary helpers do not provide one consistent lifecycle for persistent effects.
3. **Code evidence:** Catalog inspection found 341 spells, 91 without generated actions, and 141 generated actions using a zero formula. Current combat state has typed conditions/concentration but no general managed-effect root covering the whole lifecycle.
4. **Gameplay consequence:** The engine supports table adjudication but cannot truthfully claim automatic SRD rules enforcement for effects such as summons, multi-turn zones, transformations, or world-changing magic.
5. **Verdict:** **Expected partial coverage, not a private-alpha blocker when labeled honestly; beta depth work.**
6. **Recommendation:** Add a small typed managed-effect lifecycle only for repeated high-value mechanics selected from playtest evidence. Preserve manual adjudication and provenance as first-class fallbacks; do not attempt a universal spell scripting language.

### Rules implementation constraints

Keep the proven sequence **pure resolver -> validation preview -> revision/idempotency guard -> transactional commit -> undo/audit event**. Shared rule types belong in `packages/core` or the System SDK rather than route-local objects. Rules automation must remain explicit, testable, and permission-checked. Homebrew should enter through typed grants and content provenance, not string matching or direct storage mutation.


> Independent re-audit, 2026-07-15. Cutoff is committed HEAD `b5e30f1` with a clean tree. This revision re-verifies the prior ledger's closed findings (spot-checked in code and at runtime) and adds **new findings** discovered by this session's live-play verification. Rules text is referenced by concept and SRD 5.2.1 citation, never reproduced at length.

## Rules verdict

The engine has a coherent, permission-checked, reviewable D&D 5.5e core for its declared SRD-oriented scope. Character math this session checked at runtime was correct in every sampled case (ability/save/skill/initiative/passives, proficiency application, unarmed grapple/shove DCs, Second Wind healing dice, weapon attack/damage with mastery tagging, AC derivation, concentration DC rule with the 30 cap, death-save DC and critical rules).

One **new definite rules defect** was found live (R-04: Second Wind consumes the standard Action), plus one likely defect (R-05: Tactical Mind) sharing the same root cause — a default-to-Action classification for feature rolls that lack activation metadata. Both are narrow, evidenced, and scheduled (backlog T38/T39). They do not indicate a structural problem; the action-economy architecture itself behaved exactly as designed in live combat.

Maturity statement: **audited rules implementation with local acceptance re-verified; two new narrow economy defects open; external/manual release evidence pending.** Geometry, arbitrary prose, and unsupported content remain explicitly reviewed/manual or labeled unsupported — that boundary is part of the product contract.

## Verification method

1. `packages/system-sdk` calculations, prepared commands, pure resolvers (code reading + suite results);
2. API validation/authorization/revisions/idempotency/persistence (code reading + suite results);
3. live runtime verification against the demo campaign in a real browser (server responses inspected request-by-request);
4. the canonical blank-deployment Playwright journey (fresh pass, 1/1 in 1.3m);
5. focused regression suites (fresh forced root runs — see `FEATURE_AUDIT.md` validation record).

The authoritative result is the committed server mutation and its persisted/audited state. Live inspection confirmed explanations/previews derive from the same typed payloads as results (e.g., the death-save resolution and the sheet update arrived in one envelope with an undo record).

## Content inventory (measured)

| Content | Measured at `b5e30f1` | Evidence |
| --- | --- | --- |
| Classes | 12 (all PHB classes) | class names in `system-sdk/index.ts` |
| Subclasses | One per class (SRD set: Berserker, Lore, Life, Moon, Champion, Open Hand, Devotion, Hunter, Thief, Draconic, Fiend, Evoker) | feature strings in `index.ts` (e.g. "Circle of the Moon Spells", "Aura of Devotion", `dnd5eSrdHasChampionRemarkableAthlete`) |
| Species | 9 (Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, Tiefling). **Aasimar: 0 occurrences** | grep evidence; see finding R-06 |
| Backgrounds | 4 (Acolyte, Criminal, Sage, Soldier) — exactly the SRD 5.2.1 set | `index.ts` background records |
| Spells | ~342 school-tagged records across levels 0–9 | `school:` count; level distribution 29 cantrips / 73 L1 / … / 17 L9 |
| Monster stat blocks | 168 | `dnd-monster-stat-blocks.ts` (8,044 lines) |
| Compendium entries served | 835 | live compendium search, per-entry SRD 5.2.1 / CC BY 4.0 attribution |

## Coverage inventory (re-verified)

### Core character and creature concepts

| Capability | State | Evidence highlight |
| --- | --- | --- |
| Ability scores/modifiers/proficiency/skills | Verified live | Fighter Str 16 → check +3, proficient save +5; Athletics +5, Intimidation +3 |
| Saving throws and feature Advantage | Verified in code | d20 automation with per-context advantage/disadvantage and auto-fail sources (`index.ts:2664`) |
| Initiative and passive scores | Verified live | Initiative 1d20+1; passives 10 on the demo fighter |
| Class levels and multiclass scaling (T21) | Verified in code | Central class-level queries; counterexample tests |
| Armor Class intent (T30) | Verified live | `armorClassDetails {value 11, base 10, dexModifier 1, Unarmored}` in sheet payload |
| Monster exact saves/skills/initiative (T22) | Verified in code | `dnd-monster-core-rolls.ts` preserves stat-block bonuses |
| Typed managed actor/item views (T17) | Verified in code | Managed-root set `app.ts:16876`; unknown fields preserved |
| Exhaustion | Verified in code | Levels 1–6 with clamping; threads into d20 automation; Long Rest reduces by one level (`index.ts:9994`) |

### Defenses, damage and conditions

| Capability | State | Evidence highlight |
| --- | --- | --- |
| Typed damage, Resistance/Vulnerability/Immunity ordering (T02) | Verified in code | Ordered stages; `resistance-and-vulnerability` tag |
| HP/temp HP/healing | Verified live | Healing effect envelope `{pool: hp, amount, before, after}` |
| Zero HP / unconscious / Stable / dead (T03/T04) | Verified live | Monster dead-by-default with knockout opt-out (code); character death-save lifecycle exercised live |
| Death Saving Throws (T04) | **Verified live** | Natural 20 → `critical-success`, `result: "revived"`, +1 HP, counters reset, `lifeState: "conscious"`, atomic actor+combat update, undo envelope. Metadata carries DC 10, crit rules, 3-to-stabilize/3-to-die |
| Conditions/effects/durations | Verified in code | Condition records with sources; effect schedules (`dnd-advanced-mechanics.ts:195`) |
| Concentration | Verified live | Sheet shows concentration state; check formula 1d20+4 with "DC 10 or half damage, max 30" rule metadata |
| Rage (T29) | Verified in code | Lifecycle with heavy-armor eligibility gate, extension triggers, per-roll damage bonus; declares `action: "Bonus Action"` correctly |

### Creation, advancement and resources

| Capability | State | Evidence highlight |
| --- | --- | --- |
| Level-one creation | Verified live | Canonical journey builds a legal character through validation |
| Advancement/ASI/feats/subclasses | Verified in code | Choices survive errors; retry (T35) |
| Multiclass spell slots (T01) | Verified in code | Odd half-caster levels round up before composition |
| **Multiclass hit dice** | **Verified fixed** | Per-class `hitDicePools` (className/size/current/max) now created on multiclass advancement (`index.ts:3563`); the earlier single-pool simplification no longer applies. Warlock pact slots kept separate from shared slots |
| Short/Long Rest | Verified in code | HP/Hit Dice/resources/spell resources/death/exhaustion recovery |
| Heroic Inspiration (T09) | Verified live | Grant → Ready; overflow-grant transfer picker (5.5e "give it away when already inspired"); single-d20 reroll of a kept die with audit |
| Limited-use resources | Verified live | Second Wind 2/2 → preview shows spend to 1 remaining with resource envelope |

### Combat, actions and rolls

| Capability | State | Evidence highlight |
| --- | --- | --- |
| Standard Action economy (T23) | Verified live | Turn-scoped ledger observed: `{round: 1, turnIndex: 0, actionsUsed: 1, actionSurgeGrants: 0}` + audit event "Standard Action used" |
| Action Surge (T23) | Verified in code | Grants exactly one extra Action; out-of-turn/duplicate blocked |
| Bonus Actions and Reactions | Partial — see R-04/R-05 | Classification relies on roll metadata; correct for spells and Rage, wrong for Second Wind, questionable for Tactical Mind |
| Attacks, typed damage, saving-throw actions | Verified live | Longsword +5 / 1d8+3 (1d10+3 versatile) with mastery `sap` |
| Calculation overrides (T24) | Verified in code | One typed source drives result and explanation |
| Recorded-roll replay (T36) | Verified live | Fairness metadata on every live roll; explicit no-precommit boundary in code comment and contract |
| Structured consequences (T31) | Verified live (spec) | Canonical journey asserts review dialog structure, focus management, cancel-without-spend |
| Combat stale conflicts (T06) | Verified in code | One unchanged-position retry only |

### Weapon Mastery and controlled creatures

| Capability | State | Evidence highlight |
| --- | --- | --- |
| Cleave/Graze/Nick/Sap/Slow/Topple/Vex | Verified in code | Semantics match SRD 5.2.1 (Graze = ability-mod damage on miss; Slow = −10 ft non-stacking; Topple = Con save vs 8+mod+PB; Vex = advantage on next attack; Nick = once/turn Light extra attack inside the Attack action) with source-page citations |
| Push | Declared boundary | Reviewed manual geometry ≤10 ft vs Large or smaller; never mutates token position |
| Summons/transformations (T37) | Verified in code | Typed handoff, source-locked complete stat blocks, atomic confirm, reload-scoped draft |
| Lair/regional mechanics | Verified in code | Scheduled environment mechanics: initiative-count / round-start / round-end triggers, interval rounds, once-per-round guard (`dnd-advanced-mechanics.ts:300`) |
| Legendary actions | Partial (manual) | Stat-block prose + trackable effect roll; no per-round use counter or between-turns prompt (see R-07 / backlog T42) |

## New findings (this audit)

### R-04 — Second Wind consumes the standard Action (definitely incorrect)

1. **Rule concept:** Second Wind is a Bonus Action (SRD 5.2.1 Fighter).
2. **Current behavior:** the Second Wind quick roll (`feature-second-wind-healing`) carries no `action`/`activation` metadata, so `dnd5eSrdActionKind` falls through to `"action"`. In live combat the resolution recorded `action.kind: "action"`, ledger `actionsUsed: 1`, and audit "Standard Action used".
3. **Evidence:** `packages/system-sdk/src/dnd-action-economy.ts:9-16` (classifier default); `packages/system-sdk/src/index.ts:1268-1274` (roll built without activation metadata); live resolution envelope captured this session showing the ledger consume.
4. **User-facing consequence:** a Fighter who uses Second Wind during their combat turn is then blocked (`action_already_used`) from taking their Action — attacking becomes impossible that turn. Successful-looking wrong outcome in the core combat loop.
5. **Verdict:** definitely incorrect.
6. **Recommendation:** automate the fix (add `action: "Bonus Action"` metadata to the Second Wind roll; add a classifier regression asserting `bonusAction`); audit all feature rolls lacking activation metadata at the same seam. Backlog T38.

### R-05 — Tactical Mind classified as an Action (likely incorrect)

1. **Rule concept:** Tactical Mind (Fighter level 2) augments a failed ability check by expending a Second Wind use; it is not an Action.
2. **Current behavior:** the `1d10` quick roll has no activation metadata → classified `"action"` → consumes the turn's Action when used in combat.
3. **Evidence:** `index.ts:1286-1292` (roll definition); same classifier default as R-04.
4. **User-facing consequence:** using Tactical Mind during combat (e.g., on a Perception check) silently burns the Action.
5. **Verdict:** likely incorrect (usage timing in combat is uncommon but legal).
6. **Recommendation:** classify as `"free"` with its resource spend reviewed; regression test. Backlog T39.

### R-06 — Species coverage: Aasimar absent (unable to verify against SRD)

1. **Rule concept:** SRD 5.2.1 species list.
2. **Current behavior:** nine species implemented; zero occurrences of "Aasimar" anywhere in the SDK.
3. **Evidence:** grep across `packages/system-sdk/src`.
4. **User-facing consequence:** if SRD 5.2.1 includes Aasimar, character creation is missing a legal SRD species; if it does not, the current set is complete and this is a non-issue.
5. **Verdict:** unable to verify from the repository alone (this audit does not assert SRD contents beyond the shipped data).
6. **Recommendation:** check the SRD 5.2.1 species index once, then either add the species record or document the intentional boundary. Backlog T43.

### R-07 — Legendary actions have no use-economy (partial; DM-adjudicated today)

1. **Rule concept:** legendary creatures take a fixed number of legendary actions per round, spent after other creatures' turns.
2. **Current behavior:** stat blocks describe legendary actions in prose entries with a generic trackable effect ("Use this effect roll to track legendary action availability"); no counter, no between-turn prompt, no per-round reset.
3. **Evidence:** `dnd-monster-stat-blocks.ts:79, 4466, 5010…` (14 entries); no legendary handling in `app.ts`/`App.tsx`.
4. **User-facing consequence:** a DM running an adult dragon tracks legendary action uses by hand; forgetting the reset or count is easy in round-heavy fights.
5. **Verdict:** configurable/partial — consistent with the product's reviewed-manual philosophy, but weaker than the lair-mechanics scheduling that already exists.
6. **Recommendation:** schedule (do not block on): model legendary uses as a per-round-reset resource with a between-turns prompt, reusing the existing environment-mechanics scheduler. Keep option selection manual. Backlog T42.

### Verified-fixed since the prior audit (recorded for history)

- Multiclass hit dice: per-class pools implemented (see coverage table) — closes the residual simplification noted in the 2026-07-03 review.
- Aggregate-gate stability (T07): `maxWorkers: 2` committed with rationale; fresh forced runs completed without worker/RPC errors.

## Closed rules finding ledger (T01–T37, spot re-verified)

| Ticket | Former defect | Resolution state at `b5e30f1` |
| --- | --- | --- |
| T01 | Odd-level half-caster contribution rounded down | Round-up composition retained with regressions (verified in code) |
| T02 | Resistance/Vulnerability collapsed | Ordered typed stages (verified in code) |
| T03 | Monsters used character-style 0-HP unconscious | Dead-by-default + knockout exception (verified in code, both resolver sites) |
| T04 | Death Save was roll metadata only | Atomic lifecycle (verified live: nat-20 revive path) |
| T09 | Inspiration disconnected | Grant/transfer/spend/reroll lifecycle (verified live) |
| T20 | Support boundaries invisible | Runtime labels (verified live in combat panel) |
| T21 | Multiclass read total/primary level | Central class-level semantics (verified in code) |
| T22 | Monster bonuses reconstructed | Exact stored bonuses roll directly (verified in code) |
| T23 | No Action tracking; Surge only spent | Turn ledger + exactly one extra Action (verified live) |
| T24 | Override changed explanation only | Typed override drives both (verified in code) |
| T27 | Advantage metadata didn't change roll | Actual roll mode reflects Advantage (verified in code) |
| T28 | Mastery didn't resolve | All eight properties with review/commit; Push manual (verified in code) |
| T29 | Rage only consumed a resource | Active lifecycle (verified in code) |
| T30 | Numeric AC silently froze derivation | Explicit intent + migration (verified in code + live AC breakdown) |
| T31 | Truncating native confirms | Structured accessible review (verified via canonical spec assertions) |
| T36 | Replay overclaimed as provably fair | Trusted-host boundary stated in code/contract/UI (verified live + code) |
| T37 | Summon flow disconnected | Typed locked handoff (verified in code) |

## Architecture boundaries (unchanged, endorsed)

- **Hard-coded engine semantics** for cross-content invariants: d20 modes, proficiency/class-level math, action economy, HP/death transitions, ordered damage stages, resource spend, concentration, effect schedules, AC intent, override application.
- **Data-driven content** for classes/subclasses/species/backgrounds/feats/spells/items/monsters/mastery; unknown legacy/homebrew fields preserved outside managed roots.
- **Reviewed manual consequences** for Push placement, cover, line of effect, pathfinding, difficult terrain, ambiguous targets, arbitrary prose. Manual is labeled and auditable, not invisible.
- **Unsupported** content is labeled before spend/commit. New support should be the smallest typed seam plus a counterexample — R-04 is a textbook case (one metadata field + one classifier regression), not a rules-language rewrite.

## Homebrew and DM control

Managed D&D fields validate at touched boundaries; unknown fields round-trip losslessly (T17). DMs get reviewed overrides, explicit fixed values, and manual consequences with provenance rather than silent replacement. Verified live: per-actor condition-immunity override and custom-conditions controls on the sheet; "Rules trace & calculation sources" drawer exposes derivations.

## Content and licensing boundary

Shipped content is SRD 5.2.1 under CC BY 4.0; every compendium entry served carries source, license, and the Wizards attribution string (verified live). The implementation does not establish rights to distribute proprietary non-SRD text; public content claims remain gated by X06.

## Rules-related release gates

- **Before internal/private real-table play:** fix R-04 (T38); R-05 (T39) strongly recommended in the same change.
- **X01** repeated real-table sessions must exercise corrections, conflicts, recovery, privacy, and reviewed manual outcomes.
- **X04** physical AT/device evidence must cover rules review and commit controls.
- **Public release:** X06 content/legal, X07 independent security (rules mutations, plugins, adversarial AI), X08 AI quality if offered.

No other code-addressable rules defect from this audit remains open. New counterexamples should reopen the relevant ticket with a reproducible case rather than weakening the evidence boundary.
