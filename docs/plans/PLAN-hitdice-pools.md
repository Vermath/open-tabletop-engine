# Plan D: Per-class hit-dice pools for multiclass characters (SDK only)

**Context:** multiclass support recomputes features/resources/spell slots per class,
but hit dice remain ONE aggregate pool `data.hitDice = { current, max, size }` with
`size` taken from the primary class. A Fighter 5 / Wizard 2 should have 5d10 + 2d6.
**Goal:** model per-class pools in the rules engine while keeping the aggregate
`hitDice` shape fully intact for every existing consumer.

**Scope fence:** `packages/system-sdk/src/index.ts` and `index.test.ts` ONLY.
Verified fact: `apps/web` has ZERO references to `hitDice` — do not touch web. Do
not touch `apps/api` source (its rest/advancement routes delegate to the SDK); you
WILL re-run the API test suite at the end because it consumes the SDK build.

## Tripwires

- All tripwires from PLAN-xp-level-loop.md apply. Critical ones here:
  `pnpm --filter @open-tabletop/system-sdk build` after edits, then run
  `pnpm --filter @open-tabletop/api test` (218/1 skipped must hold — API tests
  exercise SRD rest/advancement through the built SDK).
- Backward compatibility is the acceptance bar: every existing test must pass
  UNCHANGED except where a test itself pins the old single-pool behavior for a
  MULTICLASS actor — those may be updated, with justification in the report.
- No `.git` writes / no commits; print the commit message (with the
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer).

## Design (additive)

New optional field `data.hitDicePools: Array<{ className: string; size: string;
current: number; max: number }>` maintained ALONGSIDE the aggregate `data.hitDice`:
- aggregate `max` = sum of pool maxes; aggregate `current` = sum of pool currents;
  aggregate `size` stays the primary class's die (unchanged semantics).
- Single-class actors: do NOT add pools (nothing changes for them) unless they
  multiclass, at which point pools are initialized from their existing class/level
  (`current` proportionally from the aggregate: spent dice come off the primary
  class pool first).

## Implementation

1. **`dnd5eSrdApplyClassLevels`** (anchor: existing function of that name): when the
   classes array has 2+ entries, build/maintain `hitDicePools` — one entry per class
   (`size` via `dnd5eSrdHitDieSize(className)`, `max` = that class's level). The
   newly gained level adds one die to the leveled class's pool (current and max).
   Keep the aggregate fields exactly consistent with the pools (sum invariants
   above). When pools are absent on a multiclass actor (legacy data), initialize
   them from `dnd5eSrdActorClassLevels(actor)` before applying the level.
2. **Rest logic:** locate the SRD rest implementation (grep `applyDnd5eSrdRest` and
   follow to where hit dice are spent/regained). Whatever the current aggregate
   behavior is (e.g., long rest regains up to half of max, short rest spends), apply
   the SAME totals but distribute across pools: regain into the largest die size
   first; spend from the largest available die first. The aggregate result must
   equal today's numbers exactly — write a test asserting aggregate parity between a
   pooled multiclass actor and the pre-change math.
3. **`dnd5eSrdSheet`:** if the sheet payload surfaces hit dice, add a formatted
   per-pool string for multiclass actors (e.g., `"5d10 + 2d6"`) as an ADDITIVE field
   (do not change existing fields).
4. **Exports:** export a small helper `dnd5eSrdHitDicePools(actor)` returning the
   pools (computing them on the fly for multiclass actors without stored pools) so
   future UI work has a single entry point.

## Tests (extend `index.test.ts`)

- Multiclassing Fighter 5 → +Wizard yields pools [{Fighter,d10,5,5},{Wizard,d6,1,1}]
  and aggregate {current: 6, max: 6, size: "d10"} (assuming full dice before).
- Leveling the primary class of a pooled actor grows the right pool.
- Long rest on a pooled actor with spent dice: aggregate regained amount identical
  to the single-pool behavior; distribution hits the largest die first.
- Single-class actor before/after: `hitDicePools` absent, aggregate untouched.
- Legacy multiclass actor (classes array, no pools, partially spent aggregate):
  pools initialize with the deficit taken from the primary class pool.

## Gates + report

SDK typecheck + tests + build, then API typecheck + full API test suite. Report:
design notes, invariants, any pinned-behavior tests you had to update and why, the
commit message.
