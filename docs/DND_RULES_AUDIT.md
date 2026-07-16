# D&D 5.5e Rules Audit

> Current-state rules audit, 2026-07-16. It covers committed HEAD `e4c6ac9` plus the validated implementation working tree. Every code-addressable rules ticket identified by the audit is implemented, and the frozen local aggregate/canonical acceptance gates passed. No external/manual evidence is inferred.

## Rules verdict

The engine now has a coherent, permission-checked and reviewable D&D 5.5e core for the declared SRD-oriented scope. The earlier successful-looking wrong outcomes in multiclass scaling, monster rolls, Action economy, calculation overrides, save Advantage, Weapon Mastery, Rage and Armor Class semantics have connected implementations and counterexample tests. Death Saves and Heroic Inspiration are full lifecycles rather than roll metadata or disconnected helpers.

The correct maturity statement is **audited rules implementation and local acceptance complete; external/manual release evidence pending**. This does not mean every D&D sentence is automated. Geometry, arbitrary prose and unsupported content remain explicitly reviewed/manual or unsupported. Those boundaries are part of the product contract.

## Verification method and source of truth

Rules claims were traced through:

1. `packages/system-sdk` calculations, prepared commands and pure resolvers;
2. API validation, authorization, revisions, idempotency and persistence;
3. shared types and actor/combat state transitions;
4. typed API client/contracts;
5. player/DM review and commit surfaces;
6. focused SDK/API/web regressions and public-UI E2E specifications.

The authoritative result is the committed server mutation and its persisted/audited state, not a label or preview alone. Explanations and previews must derive from the same typed inputs as the result.

## Coverage inventory

### Core character and creature concepts

| Capability | Current state | Boundary/evidence |
| --- | --- | --- |
| Ability scores, modifiers, proficiency and skills | Implemented | Canonical sheet and quick-roll paths use authoritative actor data |
| Saving throws and feature Advantage | Implemented | Advantage changes the actual roll mode and records its source |
| Initiative and passive scores | Implemented | Character derivation and exact monster initiative are distinct |
| Class levels and multiclass scaling | Implemented | Central class-level queries replace total-level/primary-class shortcuts |
| Fixed, derived and overridden Armor Class | Implemented | Explicit intent/provenance prevents stale numeric AC from silently freezing a character |
| Monster exact saves/skills/initiative | Implemented | Conversion preserves the stat-block bonuses used by rolls |
| Typed managed actor/item views | Implemented | Versioned managed roots validate touched boundaries; unknown legacy/homebrew fields round-trip losslessly |

### Defenses, damage and conditions

| Capability | Current state | Boundary/evidence |
| --- | --- | --- |
| Typed damage, Resistance, Vulnerability and Immunity | Implemented | Ordered stages retain the T02 counterexamples |
| HP, temporary HP and healing | Implemented | Actor/combat state remains synchronized |
| Zero HP, unconscious, Stable and dead | Implemented | Monster knockout exception and character Death Save lifecycle are explicit |
| Death Saving Throws | Implemented | Success/failure, natural 1/20, healing, stabilization/death and counter reset commit atomically |
| Conditions/effects/durations | Implemented | Source, duration, concentration and cleanup are persisted |
| Concentration | Implemented | Replacement, damage checks and reviewed consequences share authoritative state |
| Rage | Implemented | Active state drives duration/end, damage, resistance, restrictions and resource use |

### Character creation, advancement and resources

| Capability | Current state | Boundary/evidence |
| --- | --- | --- |
| Level-one creation and declared SRD choices | Implemented | Server validation remains authoritative |
| Advancement, ASI/feats/subclasses | Implemented | Errors preserve choices/pending state and allow retry |
| Multiclass spell slots | Implemented | Supported odd half-caster contribution rounds up before composition |
| Class feature eligibility/scaling | Implemented | Uses relevant class level, including multiclass counterexamples |
| Short/Long Rest | Implemented | HP, Hit Dice, resources, spell resources and death/exhaustion recovery are connected |
| Heroic Inspiration | Implemented | Visible state and permissioned grant/transfer/spend/reroll with audit/history |
| Limited-use resources | Implemented | Spend/recharge/recovery uses prepared reviewed mutations |

### Combat, actions and rolls

| Capability | Current state | Boundary/evidence |
| --- | --- | --- |
| Standard Action economy | Implemented | One turn-scoped Action is enforced authoritatively |
| Action Surge | Implemented | Resource spend grants exactly one extra Action |
| Bonus Actions and Reactions | Implemented | Turn/round scope remains explicit |
| Attacks, typed damage and saving-throw actions | Implemented | Preview/review/commit shares typed identifiers |
| Calculation overrides | Implemented | One typed override source changes authoritative calculations and their explanations |
| Recorded-roll replay | Implemented with a trusted-host boundary | Persisted paths replay the stored formula, seed and result; this is not a witnessed pre-roll commitment or proof of host seed fairness |
| Structured consequences | Implemented | Accessible complete review; cancel does not spend or mutate |
| Combat stale conflicts | Implemented | Only an unchanged turn position receives one bounded retry |

### Weapon Mastery and controlled creatures

| Capability | Current state | Boundary/evidence |
| --- | --- | --- |
| Cleave, Graze, Nick, Sap, Slow, Topple and Vex | Implemented | Selection, availability, preview and commit handling are connected to supported consequences |
| Push | Implemented as reviewed manual geometry | The engine records the consequence and lets the table choose legal placement; it does not guess displacement through walls, occupied squares or terrain |
| Summons/transformations | Implemented | A typed prepared handoff opens controlled-creature review before spending |
| Controlled-creature confirm/cancel/resume | Implemented | Complete source stat blocks are locked, mutations recheck current membership/workspace, confirm is atomic, cancel spends nothing, and same-tab reload restores the scoped draft but requires a fresh preview |

## Closed rules finding ledger

| Ticket | Former defect | Current resolution |
| --- | --- | --- |
| T01 | Odd-level half-caster contribution rounded incorrectly | Supported round-up composition is retained by regression tests |
| T02 | Combined Resistance/Vulnerability was collapsed incorrectly | Ordered typed stages are authoritative |
| T03 | Monsters defaulted to character-style unconscious at 0 HP | Dead-by-default plus explicit knockout exception |
| T04 | Death Save was only roll metadata | Atomic lifecycle and actor/combat sync |
| T09 | Inspiration helpers were disconnected from the player loop | Visible audited grant/transfer/spend/reroll lifecycle |
| T20 | Manual/unsupported boundaries were not visible | Runtime support labels and commit behavior are explicit |
| T21 | Multiclass features read total or primary-class level | Central relevant-class-level semantics |
| T22 | Monster bonuses were reconstructed | Exact stored stat-block bonuses roll directly |
| T23 | Standard Action was not tracked; Surge only spent | Turn ledger plus one extra Action |
| T24 | Override changed explanation but not play | Typed override changes authoritative result and explanation |
| T27 | Advantage metadata left formula at normal d20 | Actual roll mode reflects Advantage |
| T28 | Mastery metadata did not resolve | All eight properties have review/commit treatment; Push remains deliberately manual geometry |
| T29 | Rage only consumed a resource | Active lifecycle drives its effects and restrictions |
| T30 | Any numeric AC silently overrode derivation | Explicit fixed/derived/override intent |
| T31 | Native confirmation truncated/obscured consequences | Accessible structured review |
| T36 | Replay metadata differed by roll path and was overclaimed as provably fair | Consistent persisted replay contract with an explicit no-precommit/no-host-fairness boundary |
| T37 | Summon/transformation and controlled-creature flow were disconnected | Typed handoff with source-locked complete stat blocks, current-authority checks, same-tab reload recovery and atomic confirm |

## Hard-coded, data-driven and manual boundaries

### Hard-coded engine semantics

Use typed code for invariants that must be consistent across content: d20 modes, proficiency/class-level math, action economy, HP/death transitions, ordered damage defenses, resource spend, concentration, effect schedules, Armor Class intent and authoritative override application.

### Data-driven content

Use versioned records for classes, subclasses, species, backgrounds, feats, spells, items, monsters and mastery definitions. Validation must preserve unknown legacy/homebrew fields outside managed roots and must not reinterpret proprietary formats as supported content.

### Reviewed manual consequences

The engine should present enough structured context for a DM/player decision but not invent:

- Push placement and other obstacle/occupancy-dependent movement;
- cover, line of effect, pathfinding and difficult-terrain routing;
- ambiguous targets, narrative triggers and arbitrary rules prose;
- table-specific homebrew adjudication.

Manual does not mean invisible. The consequence must be labeled, reviewable and auditable, and supported portions of the action remain committable.

### Unsupported

Unsupported prose or content must be labeled before spend/commit. It must not masquerade as an authoritative automatic result. Adding support should use the smallest typed rule seam and a concrete counterexample, not a universal rules language.

## Homebrew and DM control

Homebrew remains compatible with authoritative rules because managed D&D fields are validated at touched boundaries while unknown fields are preserved. DMs can use reviewed overrides, explicit fixed values and manual consequences without direct storage mutation. Overrides carry intent and provenance rather than silently replacing derivation.

## AI boundary

The rules work does not redesign AI behavior. Manual proposal review and campaign-governed automatic execution both remain available behind existing deployment/campaign policy, permission intersection, transaction revalidation, audit and disclosure controls. AI guidance is not a source of authoritative rules state unless it invokes the same permissioned typed command path.

## Content and licensing boundary

The implementation can model SRD-oriented mechanics and user-supplied licensed/homebrew records. It does not establish rights to distribute proprietary non-SRD text. Public content claims remain blocked by X06 legal inventory and approval.

## Remaining rules-related release gates

### Completed local acceptance

- Three consecutive forced root checks passed on the frozen implementation/test tree. Each recorded lint 25/25, typecheck 25/25, E2E typecheck, tests 25/25 with 303 files, 1,822 passing tests and 1 skipped test, and builds 15/15.
- The isolated canonical Playwright journey passed 1/1 in 1.4 minutes against frozen snapshot `20260716T030254960Z`.
- The canonical evidence includes campaign `camp_mrmxcfz6lx78jmmt`, actor `act_mrmxciy7vlh0m0q1`, combat `cmb_mrmxd9kkqv4iwb56`, action `cact_mrmxdfqn3iqu6eca` and preview `dnd-action-preview:3d8ca513-f058-4d00-8425-5c979d681bd1`.

### Internal/private play

- X01 repeated real-table sessions must exercise corrections, conflicts, recovery, player privacy and reviewed manual outcomes.
- X04 physical assistive-technology/device evidence must cover rules review and commit controls.

### Public release

- X06 content/legal approval.
- X07 independent security review of rules mutations, permissions, plugins and adversarial AI tool use.
- X08 representative AI quality/provider handling if AI is offered.

No additional code-addressable rules defect from this audit remains intentionally open. New counterexamples should reopen the relevant risk/ticket with a reproducible case rather than weakening this evidence boundary.
