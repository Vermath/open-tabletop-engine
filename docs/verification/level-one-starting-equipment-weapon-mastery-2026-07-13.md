# Level-one SRD starting equipment and Weapon Mastery verification

The guided `level-one-srd` creator implements the starting-equipment, starting-gold, tool, and Weapon Mastery choices in the official [System Reference Document 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf). Page references below use the printed page number followed by the zero-based PDF page index returned by PDF tooling.

## Class starting equipment evidence

| Class | Printed / PDF page | Equipment package GP | Gold alternative | Exact package-specific choices |
| --- | ---: | ---: | ---: | --- |
| Barbarian | 28 / 27 | 15 | 75 | None |
| Bard | 31 / 30 | 19 | 90 | One Musical Instrument; three independent Musical Instrument proficiencies |
| Cleric | 36 / 35 | 7 | 110 | One Holy Symbol form |
| Druid | 41 / 40 | 9 | 50 | Fixed Druidic Focus (Quarterstaff); fixed Herbalism Kit proficiency |
| Fighter | 47 / 46 | 4 (A) or 11 (B) | 155 | Two fixed equipment packages |
| Monk | 49 / 48 | 11 | 50 | One Artisan's Tools or Musical Instrument proficiency; package A grants that same chosen tool |
| Paladin | 53 / 52 | 9 | 150 | One Holy Symbol form |
| Ranger | 57 / 56 | 7 | 150 | Fixed Druidic Focus (sprig of mistletoe) |
| Rogue | 61 / 60 | 8 | 100 | Fixed Thieves' Tools proficiency |
| Sorcerer | 64 / 63 | 28 | 50 | Fixed Arcane Focus (crystal) |
| Warlock | 70 / 69 | 15 | 100 | Fixed Arcane Focus (orb) and Book (occult lore) |
| Wizard | 77 / 76 | 5 | 55 | Fixed Arcane Focus (Quarterstaff) and Spellbook; initial spell selection remains outside this slice |

The typed catalog preserves every listed item and quantity, including the Fighter's two equipment packages, weapon multiples, one bundle of 20 Arrows, Parchment sheet counts, pack forms, fixed focus forms, and subject metadata for background/class Books. A Spellbook compendium entry was added so the Wizard package is not represented by an inferred template placeholder.

## Background starting equipment evidence

All four backgrounds and the package-or-50-GP rule are on printed page 83 (PDF page 82).

| Background | Equipment package GP | Exact package-specific choices |
| --- | ---: | --- |
| Acolyte | 8 | One Holy Symbol form |
| Criminal | 16 | None |
| Sage | 8 | None |
| Soldier | 14 | One Gaming Set proficiency; package A grants that same Gaming Set |

The published nested option tables are also source-bound: Artisan's Tools, Gaming Sets, and Musical Instruments are on printed page 94 (PDF page 93); Holy Symbol forms are on printed page 97 (PDF page 96).

## Weapon Mastery evidence

The weapon table and each weapon's fixed mastery property are on printed page 91 (PDF page 90). Level-one selection counts and eligibility are:

| Class | Printed / PDF page | Count | Eligibility |
| --- | ---: | ---: | --- |
| Barbarian | 29 / 28 | 2 | Simple or Martial Melee weapons |
| Fighter | 48 / 47 | 3 | Simple or Martial weapons |
| Paladin | 54 / 53 | 2 | Proficient weapons; this class is proficient with Simple and Martial weapons |
| Ranger | 58 / 57 | 2 | Proficient weapons; this class is proficient with Simple and Martial weapons |
| Rogue | 62 / 61 | 2 | Simple weapons, plus Martial weapons with Finesse or Light |
| Bard, Cleric, Druid, Monk, Sorcerer, Warlock, Wizard | respective class pages | 0 | Injected mastery selections are rejected |

The origins endpoint publishes all 38 weapon kinds with their fixed mastery property and each class's eligible IDs. The server accepts only the exact count of unique eligible weapon kinds, derives the mastery property from the compendium, and persists it with SRD provenance. A selected weapon need not be owned or equipped. Later Long Rest swaps are recorded as `manual-long-rest`; no automatic swap workflow was introduced.

## Validation, grants, and compatibility

Strict creation requires one class package and one background package. It additionally requires only the nested choices belonging to those selected packages, class/background tool choices required independently of equipment, and the exact Weapon Mastery count. Unknown package IDs, unexpected nested choice keys, malformed selections, repeated tools/weapons, and weapons outside class proficiency are rejected before actor or item persistence.

Items are constructed server-side from the published catalogs; the request cannot supply grant IDs, quantities, mastery properties, or currency. Each granted item records whether it came from the class or background package, the source ID, and package ID. Starting currency is the exact sum of the selected class and background packages. Legitimate same-item grants from two different published sources remain separate so provenance and quantities are not lost.

Strict creation replaces inferred template equipment while retaining existing template spell placeholders because spell selection is explicitly outside this slice. Direct legacy template creation and legacy origin application continue to use their previous template items and background 50 GP behavior.

## Focused verification

On 2026-07-13, focused verification passed:

- system SDK: 11 guided creator tests, typecheck, and build;
- API: 3 guided creator API tests;
- web: 12 creator tests and typecheck;
- API contracts: 23 tests and typecheck;
- API client: 18 tests and typecheck.

Coverage includes all class/background package totals, page metadata, nested/linked tool and focus choices, server-derived item provenance and summed currency, exact mastery counts and eligibility, fixed property persistence, forged and duplicate rejection, accessible creator controls, OpenAPI and client types, and legacy compatibility.

The API package typecheck now passes. The earlier concurrent `CompendiumConflict` import diagnostic was resolved without changing the equipment/mastery route contract.
