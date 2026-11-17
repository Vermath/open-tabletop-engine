# Calculation explanations and campaign compatibility verification

Date: 2026-07-13

## Delivered behavior

- D&D 5.5e SRD actor calculations expose the authoritative result, ordered terms, and source provenance for abilities, proficiency, Armor Class, hit points, initiative, saves, skills, passive Perception, speed, spellcasting, and visible action formulas.
- Every explained field carries explicit manual, override, unsupported, and ambiguous booleans plus human-readable reasons.
- The explanation builder consumes the existing D&D rules helpers. It does not create a second rules DSL or recalculate values in the formatter.
- The actor endpoint requires `actor.read` and actor-private-data access. A denied response does not include actor-private content.
- The campaign compatibility endpoint requires `campaign.update`, is deterministic and read-only, and covers rules systems, core ranges, D&D schema validation, missing/cross-system references, compendium provenance/version drift, and calculation review flags.
- The compatibility repair preview always reports zero automatic changes. No migrations, compendium replacement, or unknown/homebrew-field deletion occurs.
- Actor sheets use progressive disclosure for ordered calculation terms and provenance. The Compendium tab shows the compatibility dashboard only to campaign editors/GMs.
- Both panels include loading, retry, empty/success, warning, and blocking presentation without rendering raw JSON.

## Focused evidence

| Package | Command | Result |
| --- | --- | --- |
| Core | `node scripts/run-package-manager.mjs --filter @open-tabletop/core test -- --run src/compatibility.test.ts` | 1 test passed |
| System SDK | `node scripts/run-package-manager.mjs --filter @open-tabletop/system-sdk test -- --run src/calculation-explanations.test.ts` | 2 tests passed |
| API | `node scripts/run-package-manager.mjs --filter @open-tabletop/api test -- --run src/calculation-compatibility.test.ts` | 2 tests passed |
| API contracts | `node scripts/run-package-manager.mjs --filter @open-tabletop/api-contracts test -- --run src/calculation-compatibility.test.ts` | 1 test passed |
| API client | `node scripts/run-package-manager.mjs --filter @open-tabletop/api-client test -- --run src/calculation-compatibility.test.ts` | 1 test passed |
| Web | `node scripts/run-package-manager.mjs --filter @open-tabletop/web test -- --run src/calculation-explanation-panel.test.tsx src/compatibility-panel.test.tsx` | 6 tests passed |

The API evidence includes a level-one private D&D actor, denied player access with sentinel non-disclosure, a drifted SRD longsword, a referenced missing system, deterministic repeated reports, and a campaign-data before/after equality check. SDK evidence covers a level-one Rogue and a condition/attunement-sensitive Cleric so item, class, condition, override, unsupported, and ambiguous sources are exercised.
