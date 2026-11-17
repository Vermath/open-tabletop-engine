# Level-one spells, feats, and class choices verification

Date: 2026-07-13

Rules source: [System Reference Document 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf). No proprietary non-SRD character content is included.

`sourcePage` below is the printed page number. `sourcePdfPage` is the zero-based PDF page index used by the API metadata and screenshot tooling.

## Verified level-one spell capacities

| Class | Level-one selection | Slots | Printed / PDF index | Published spell-list pages | Catalog size at level one |
| --- | --- | --- | --- | --- | --- |
| Bard | 2 cantrips; 4 prepared level 1 spells | 2, Long Rest | 31 / 30 | 33-35 / 32-34 | 10 cantrips; 23 level 1 |
| Cleric | 3 cantrips; 4 prepared level 1 spells | 2, Long Rest | 36 / 35 | 38-40 / 37-39 | 7 cantrips; 15 level 1 |
| Druid | 2 cantrips; 4 prepared level 1 spells; Speak with Animals always prepared | 2, Long Rest | 41-42 / 40-41 | 44-46 / 43-45 | 11 cantrips; 18 level 1 |
| Paladin | 2 prepared level 1 spells | 2, Long Rest | 53 / 52 | 55-56 / 54-55 | 13 level 1 |
| Ranger | 2 prepared level 1 spells; Hunter's Mark always prepared | 2, Long Rest | 57-58 / 56-57 | 60 / 59 | 13 level 1 |
| Sorcerer | 4 cantrips; 2 prepared level 1 spells | 2, Long Rest | 64 / 63 | 67-69 / 66-68 | 16 cantrips; 21 level 1 |
| Warlock | 2 cantrips; 2 prepared level 1 spells | 1 Pact Magic slot, Short Rest | 70 / 69 | 74-76 / 73-75 | 7 cantrips; 12 level 1 |
| Wizard | 3 cantrips; 6 level 1 spells in the spellbook; 4 prepared from that book | 2, Long Rest | 77 / 76 | 79-82 / 78-81 | 15 cantrips; 30 level 1 |

Barbarian, Fighter, Monk, and Rogue publish no class spell selection at level one. They still receive a typed zero-capacity catalog record so clients cannot infer a missing catalog from an empty choice.

## Verified level-one choices

| Choice | Implemented options | Printed / PDF index |
| --- | --- | --- |
| Fighter Fighting Style | Archery, Defense, Great Weapon Fighting, Two-Weapon Fighting | Feature 47 / 46; Archery 87 / 86; remaining styles 88 / 87 |
| Cleric Divine Order | Protector, Thaumaturge | 37 / 36 |
| Druid Primal Order | Magician, Warden | 42 / 41 |
| Rogue Expertise | Exactly two current skill proficiencies | 61 / 60 |
| Warlock Eldritch Invocation | Armor of Shadows, Eldritch Mind, Pact of the Blade, Pact of the Chain, Pact of the Tome | Feature 70 / 69; options 72 / 71 and 74 / 73 |
| Origin feats | Alert, Magic Initiate (Cleric), Magic Initiate (Druid), Magic Initiate (Wizard), Savage Attacker, Skilled | 87 / 86 |
| Skilled | Three different skills or tools, without repeating an existing proficiency | 87 / 86 |
| Magic Initiate | Two cantrips and one level 1 spell from the selected Cleric, Druid, or Wizard list; Intelligence, Wisdom, or Charisma; one free cast per Long Rest | 87 / 86 |
| Pact of the Tome | Three cantrips and two level 1 ritual spells from the published lists | 74 / 73 |

Thaumaturge and Magician increase the applicable class cantrip count by one. Protector and Warden persist their armor and weapon proficiency grants. Bonuses whose resolution depends on an Intelligence check and a Wisdom modifier are persisted as explicit manual metadata rather than silently changing every related roll.

## Product behavior implemented

- `dnd5eSrdCharacterOrigins()` publishes typed spell, capacity, feat, invocation, order, style, Expertise, and Skilled catalogs with rules provenance.
- `dnd5eSrdResolveLevelOneRuleSelections()` validates exact counts, class lists, Wizard spellbook membership, always-prepared exclusions, invocation availability, tool and skill eligibility, and cross-source duplicate selections.
- Strict guided creation derives spell items, spell slots, Pact Magic recovery, free-cast resources, proficiencies, and origin provenance on the server. Client-supplied item or resource records are not trusted.
- Strict guided creation replaces the old template spell defaults. Template-only creation remains unchanged for existing integrations.
- Cantrips use known/always-available metadata; prepared level 1 spells are not mislabeled as known. Wizard spells distinguish `inSpellbook` from `prepared`, and Pact Tome spells retain their own preparation mode. Always-prepared spells do not consume the normal prepared-spell capacity.
- Magic Initiate background and Human feat selections have independent `1 / Long Rest` resource pools and preserve their chosen casting abilities.
- At-will invocation spells are marked `noSpellSlotRequired`. Pact of the Tome spells are marked always prepared and as Warlock spells.
- Fixed species and selected class spell overlap is merged into one item with both provenance records, avoiding duplicate grants.
- Fighting Style, Divine Order, Primal Order, Rogue Expertise, Skilled, invocation, and spell decisions are included in the creator review summary and campaign export.
- Invalid or forged guided requests return structured issues and perform no actor or item writes.

Primary implementation evidence:

- `packages/system-sdk/src/index.ts`: `dnd5eSrdSpellChoiceOptions`, `dnd5eSrdClassSpellChoices`, `dnd5eSrdResolveLevelOneRuleSelections`, `dnd5eSrdMergeLevelOneSpellGrants`, `dnd5eSrdValidateLevelOneCharacterCreation`, and `dnd5eSrdApplyCharacterOrigins`.
- `apps/api/src/app.ts`: strict create request transport and server validation flow.
- `apps/web/src/character-creator-dialog.tsx`: accessible choice fields, client feedback, and final review summary.
- `packages/api-contracts/src/index.ts` and `packages/api-client/src/index.ts`: typed OpenAPI and client surfaces.
- `packages/system-sdk/src/level-one-spells-and-features.test.ts`: all-class, legality, provenance, and compatibility coverage.
- `apps/api/src/level-one-creator-api.test.ts`: no-write rejection and campaign-export persistence coverage.

## Deliberately manual or deferred runtime work

These are not missing level-one creation inputs:

- The earlier generic post-creation spell-toggle limitation is superseded by the class-aware capacity, timing, Wizard spellbook-membership, and preview/commit controls recorded in [D&D spell-preparation verification](dnd-spell-preparation-2026-07-13.md). Discretionary spell changes outside that declared workflow remain explicit table decisions.
- Advancement now collects required Weapon Mastery selections at qualifying levels. Invocation replacement, discretionary Weapon Mastery replacement, and other later-level swap timing remain explicit manual metadata where no typed schedule is declared.
- Pact of the Blade weapon bonding, Pact of the Chain familiar entity management, and Pact of the Tome book loss or reconjuring are manual runtime operations. The legal level-one choice and its spell grants persist correctly.
- Fighter Fighting Style effects and the Thaumaturge or Magician ability-check bonus are preserved as manual metadata where broad automatic roll mutation would be ambiguous.
- This creator slice does not claim complete automated resolution for every selected spell. Existing spell action and effect support continues to determine which spell effects can be applied automatically and which require DM resolution.

## Verification commands

```text
corepack pnpm --filter @open-tabletop/system-sdk typecheck
corepack pnpm --filter @open-tabletop/system-sdk test -- src/level-one-creator.test.ts src/level-one-spells-and-features.test.ts
corepack pnpm --filter @open-tabletop/api test -- src/level-one-creator-api.test.ts
corepack pnpm --filter @open-tabletop/web typecheck
corepack pnpm --filter @open-tabletop/web test -- src/character-creator-validation.test.ts
corepack pnpm --filter @open-tabletop/api-contracts typecheck
corepack pnpm --filter @open-tabletop/api-contracts test
corepack pnpm --filter @open-tabletop/api-client typecheck
corepack pnpm --filter @open-tabletop/api-client test
```
