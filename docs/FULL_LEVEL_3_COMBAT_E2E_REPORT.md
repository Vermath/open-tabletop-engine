# Full level-3 combat end-to-end report

Date: 2026-07-17 (run completed 2026-07-18 UTC)

Audit reference: `Final Report - OpenTabletop Engine full audit at HEAD b5e30f1 (2026-07-15)`

Final journey run: `a26c7827-f936-4431-b973-e356e355bafa`

## Outcome

The full level-3 journey passed. In 141.771 seconds (`1 passed (2.5m)`, 2.8 minutes including harness startup), it generated and applied a map, created four complete level-3 characters, built and placed a three-enemy encounter, placed the party, recorded 45 combat turns through round 8, defeated all three enemies, and explicitly ended combat. The final run recorded zero browser errors and zero unresolved journey issues.

**We successfully ran simulated level-3 combat on a real, live OpenTabletop tabletop.** The simulation used the actual persisted scene, map, character sheets, tokens, encounter, turn tracker, action economy, damage, conditions, and ended-combat state, with separate live browser roles representing the DM and player. Here, “real tabletop” means the running OpenTabletop virtual tabletop application rather than a mocked rules-only test or a physical table.

The audit's authoritative cutoff baseline was 18 failed / 39 passed at `b5e30f1`. After the repairs in this worktree, the exact final tree passes the unfiltered aggregate Playwright gate, clean bootstrap, canonical public journey, and this dedicated combat journey.

| Gate | Result | Evidence |
| --- | --- | --- |
| R-04 / T38: Second Wind action economy | **Passed and repaired** | At 5 ft, Second Wind healed Aric from 20/28 to 27/28, committed as `bonusAction`, and consumed one of two uses. Greatsword Attack then committed in the same turn as the one standard `action`. The attack missed on a natural 2, and the attempted damage continuation was correctly rejected with 409 rather than consuming another action or applying damage. |
| R-05 / T39: Tactical Mind and activation metadata | **Implemented and covered** | Tactical Mind is a free failed-check continuation tied to the persisted check roll. It spends Second Wind only when the added d10 changes failure to success, refunds an unchanged failure, and blocks replay. An exhaustive classifier test covers 117 class rolls, all 9 species variants, 313 monster sources with more than 1,000 monster rolls, more than 300 spells, and more than 25 weapons. |
| T40 / T41: release gates and evidence | **Implemented locally** | Evidence recording, fingerprint binding, drift checks, timeout diagnostics, and per-run browser storage isolation are covered by the final repository gate. |
| Dedicated map-to-combat journey | **Passed** | Run `a26c7827-f936-4431-b973-e356e355bafa`; all three Goblin Warriors dead, all four party members standing, combat persisted with `active: false`. |
| Full `pnpm check` | **Passed** | Exit 0: lint, typecheck, tests, and production builds passed. API: 131 files, 807 passed and 1 intentional skip. System SDK: 38 files, 305 passed. Web: 136 files, 686 passed. |
| T48: default `pnpm e2e` release gate | **Passed on the exact tree** | Aggregate/default 62/62 in 11.0 minutes, followed serially by clean-deployment bootstrap 1/1 in 1.4 minutes. Canonical restart 1/1 and this full combat journey 1/1 also passed. The local gate is closed; CI-on-main remains external because this worktree has not been committed or pushed. |
| Chrome DM plus in-app Browser player verification | **Passed** | Chrome showed the ended round-2 recap with 7 combatants and 3 defeated Goblins. The in-app Browser showed Demo Player, two users online, all seven board tokens, and Aric's level-3 sheet/actions at 26/28 HP and AC 16. |

## Test method

The deterministic journey intentionally combines visible UI verification with authenticated API setup and play:

- Browser UI verified map application, all four character sheets, party/enemy placement, the R-04 turn, all-hostile defeat, and the ended-combat state.
- Authenticated API calls performed strict SRD character creation, reviewed level advancement, legal spell selection, token formation, and most combat commits so the journey could assert exact revisions, resource ledgers, HP deltas, and audit output.
- A separate live-role check used Chrome as the DM and the in-app Browser as the player. It verified the same persisted board, character, and ended-combat state from both roles.

This is therefore a hybrid browser/API end-to-end test, not a claim that every setup and combat action was entered solely by mouse clicks.

## Party, map, and encounter

Each character was created through the strict `level-one-srd` workflow, advanced through reviewed level changes, and checked for origin choices, abilities, skills, languages, equipment, features, resources, attacks, and caster state.

| Character | Level-3 build | Pre-combat HP / AC | Fleshed-out sheet evidence |
| --- | --- | --- | --- |
| Aric Emberguard | Soldier Goliath Champion Fighter | 20/28 / 16 | 13 features, 12 inventory entries, three weapon masteries, Great Weapon Fighting, Action Surge, Tactical Mind, Second Wind, and paired Greatsword rolls. |
| Sister Maelin | Acolyte Dwarf Life Cleric | 24/24 / 16 | 15 features, 10 inventory entries, 6/6 normal prepared Cleric spells, domain spells, Channel Divinity, and paired Mace rolls. |
| Ilyra Ashquill | Sage High Elf Evoker Wizard | 20/20 / 12 | 13 features, 10 inventory entries, a legal ten-spell book with two canonical additions per Wizard level, 6/6 normal prepared spells, and paired Dagger rolls. |
| Nox Quickstep | Criminal Human Thief Rogue | 24/24 / 15 | 13 features, 13 inventory entries, Expertise, Cunning Action, Steady Aim, Fast Hands, paired weapon rolls, and server-enforced Sneak Attack. |

The journey generated the 1200 x 800 **Ember Gauntlet** SVG with a 50-pixel grid, uploaded it, and set it as the background of the `Level 3 Ember Gauntlet` scene. It created the `Ember Gauntlet Goblin Ambush`, then placed four player-owned party tokens and three hostile SRD Goblin Warrior tokens on the board.

## Combat result

- Combat ID: `cmb_mrpvrq17e3hw8ssr`.
- Forty-five combat turns were recorded through round 8, ending at turn index 0.
- Aric proved R-04 in round 1: Bonus Action Second Wind, then standard Action Greatsword Attack. The missed attack correctly left no usable damage continuation.
- Ordinary misses, natural 1s, target/turn/slot mismatches, replayed damage, and damage without a successful triggering hit are rejected by the continuation guard.
- Nox used Sneak Attack after a qualifying weapon hit in round 4; it inherited `piercing`, and the server enforced once per turn.
- All three Goblin Warriors ended at 0 HP with `dead`; all four party members remained undefeated.
- The final persisted combat has `active: false`, round 8, turn index 0.

## Issues found and addressed

### R-04: Second Wind incorrectly consumed the standard Action

Second Wind now carries authoritative Bonus Action metadata. The integration test and full journey prove that the Fighter can heal, consume one Second Wind use, then take a standard Attack and resolve only the paired damage as a free continuation in the same turn.

### Attack damage could continue after a visible miss

The first strict journey exposed a real rules bug: the UI displayed the Goblin stat block's AC 15, but attack resolution derived an unarmored AC 12 from Dexterity. A Greatsword total of 13 therefore armed damage despite visibly missing. Combat and weapon-mastery resolution now use the canonical sheet AC. Regressions cover an ordinary miss, natural 1, and exact boundary hit.

The AI `useActorAction` path also now passes the natural d20 into resolution, preventing a natural 1 with a high modifier from arming damage.

### On-hit and follow-up rolls were too permissive

Successful attacks now arm a continuation bound to actor, combat turn, target, roll family, and slot. Direct, replayed, wrong-target, wrong-slot, and out-of-turn damage are blocked; misses do not arm damage; standard/versatile weapon branches are mutually exclusive; and a primary damage roll can explicitly arm an allowed secondary roll. Attack/resource cost remains on the triggering action, so paired damage cannot double-charge action economy.

### R-05: Tactical Mind lacked authoritative continuation semantics

Tactical Mind now references the actor's latest persisted failed ability, skill, or tool check and requires its reviewed DC. It can be attempted once, spends Second Wind only if the d10 changes the result to success, and cannot be replayed. Prepare/review/commit, permission, revision, idempotency, and audit protections remain intact.

### E2E-CHAR-01: level advancement did not own spell learning

The initial sheet run found that advancing casters increased slots and preparation capacity but offered no reviewed way to learn later-level canonical spells. Advancement now atomically validates and writes a complete normal prepared list for Clerics and Wizards and exactly two Wizard spellbook additions per Wizard level, preserving SRD class/compendium provenance and item revisions. The final journey left both casters at 6/6 prepared and the Wizard at ten legal spellbook entries without a corrective preparation mutation.

### Sneak Attack damage type and once-per-turn handling

Sneak Attack previously exposed the unsupported generic damage type `Weapon`. It now inherits a valid physical type from a qualifying finesse/ranged hit, requires advantage or explicit reviewed eligibility with no disadvantage, and is server-limited to once per turn. The final run exercised it in both rounds.

### T48 default-suite drift

The default Playwright harness now fails fast and reflects current product semantics. Repairs covered:

- `tests/e2e/auth-tabletop.spec.ts`
- `tests/e2e/backlog-ui-journeys.spec.ts`
- `tests/e2e/browser-evidence.spec.ts`
- `tests/e2e/campaign-setup-resume.spec.ts`
- `tests/e2e/bootstrap.spec.ts`
- `tests/e2e/canonical-public-journey.spec.ts`

Notable corrections include a legal Attack-to-Damage confirmation flow, robust continuation audit assertions and cleanup, scoped duplicate-scene error matching, hash-bound bootstrap dry-run/execute, and exact Rules trace evidence.

## Remaining limitations and external evidence

These are not concealed by the passing journey:

- Board geometry is caller-reviewed evidence derived from measured token positions; the action resolver does not independently reconstruct range/line geometry.
- A DiceRoll does not persist the original check DC, so Tactical Mind's DC remains reviewed request context even though the failed roll and total are loaded from storage.
- Multiclass spell-list advancement remains intentionally blocked/manual rather than guessing per-class learning decisions.
- Stateful riders such as Hunter's Mark, Hex, and Spiritual Weapon still need first-class continuation state.
- Ammunition is not yet automatically linked and consumed by a weapon attack.
- Rage/Frenzy follow-up damage still needs inherited damage typing.
- Replace-one-attack features still need explicit Extra Attack slot semantics.
- The production build passes but warns that the main web chunk is 801.27 kB, above the configured 650 kB warning threshold.
- `packages/system-sdk/src/index.ts` remains an architecture ceiling and should be split by rules domain.
- Audit items X01-X08 still require hosted/manual evidence such as repeated real-group sessions, hosted recovery and operating drills, physical assistive-technology/device testing, independent legal/security review, and AI-output quality evaluation.

## Recorded artifacts

- [Machine-readable final run evidence](../artifacts/e2e/full-level-three-combat/evidence.json)
- Journey issue log: `artifacts/e2e/full-level-three-combat/issues.md`
- [Generated Ember Gauntlet map](../artifacts/e2e/full-level-three-combat/01-generated-map.png)
- Character sheets: [Fighter](../artifacts/e2e/full-level-three-combat/02-sheet-fighter.png), [Cleric](../artifacts/e2e/full-level-three-combat/02-sheet-cleric.png), [Wizard](../artifacts/e2e/full-level-three-combat/02-sheet-wizard.png), [Rogue](../artifacts/e2e/full-level-three-combat/02-sheet-rogue.png)
- [Party and enemy placement](../artifacts/e2e/full-level-three-combat/03-party-and-enemies-placed.png)
- [R-04: Second Wind followed by Attack](../artifacts/e2e/full-level-three-combat/04-r04-second-wind-then-attack.png)
- [All hostiles defeated](../artifacts/e2e/full-level-three-combat/05-all-hostiles-defeated.png)
- [Combat ended](../artifacts/e2e/full-level-three-combat/06-combat-ended.png)
- Playwright trace directory: `artifacts/e2e/full-level-three-combat/test-results/`
- Canonical release-gate evidence directory: `artifacts/release-evidence/`

No commit, push, hosted CI run, or release deployment was performed as part of this audit response.
