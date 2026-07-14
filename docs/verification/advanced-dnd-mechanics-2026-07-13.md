# Advanced D&D combat mechanics verification — 2026-07-13

## Delivered scope

- GM-authored, typed lair-action and regional-effect prompts on `Combat`, including explicit timing, visibility, enable/disable state, optional choices, trigger counters, and a bounded server-authored trigger ledger.
- Deterministic scheduled-effect evaluation for start/end turn, start/end round, initiative count, absolute time, and manual phases. The evaluator handles round/time expiry, bounded repeat scheduling, explicit repeat-save outcomes, and removal of conditions owned only by the ending effect.
- Source-backed specialized previews for Magic Missile allocation/upcasting, Bless target/duration templates, Moonbeam damage/saves/schedule templates, and Delayed Blast Fireball accumulated dice.
- An accessible combat-panel surface for authoring and triggering environment prompts, previewing and applying reviewed schedule outcomes, and previewing specialized spells.

## API surface

| Method | Route | Boundary |
| --- | --- | --- |
| `POST` | `/api/v1/combats/{combatId}/environment-mechanics` | `combat.manage`, exact `expectedUpdatedAt`, required `Idempotency-Key` |
| `PATCH` | `/api/v1/combats/{combatId}/environment-mechanics/{mechanicId}` | same |
| `DELETE` | `/api/v1/combats/{combatId}/environment-mechanics/{mechanicId}` | same |
| `POST` | `/api/v1/combats/{combatId}/environment-mechanics/{mechanicId}/trigger` | same; explicit human trigger only |
| `POST` | `/api/v1/combats/{combatId}/effects/preview` | `actor.readPrivate`; no mutation |
| `POST` | `/api/v1/combats/{combatId}/effects/advance` | `combat.manage` plus `actor.update`, exact revision, required replay key, all due saves resolved |
| `POST` | `/api/v1/campaigns/{campaignId}/systems/{systemId}/spell-helper/preview` | D&D SRD only; actor read plus private access to the caster; no mutation |

Every route is in the OpenAPI contract, reusable TypeScript client, unauthenticated/least-privilege matrix, and MCP surface classification. The specialized environment and effect lifecycle routes are not separately exposed through MCP. The AI agent's existing proposal and governed automatic-execution modes remain unchanged; supported AI and plugin actions continue to use the ordinary permission-, revision-, validation-, and audit-checked application boundary.

## Safety and information boundaries

- Environment mechanics are prompts, not arbitrary executable rules. GM-only mechanics and trigger records are removed from player combat payloads.
- Schedule event history is visible only to combat managers or users allowed to read the affected actor's private data.
- IDs, trigger timestamps, event history, and audit summaries are server-authored. Histories are capped at 100 entries.
- A missing repeat-save outcome returns `422` and performs no actor or combat mutation.
- The scheduler never guesses damage, healing, forced movement, target selection, map geometry, or spell legality.
- Ending an effect removes only its explicitly owned conditions and only when no remaining effect owns the same condition.
- Specialized spell helpers read official installed compendium records and return provenance. They do not consume resources or mutate the caster/targets.

## Focused verification

```text
vitest run packages/system-sdk/src/dnd-advanced-mechanics.test.ts
  4 passed

vitest run apps/api/src/advanced-dnd-mechanics.test.ts
  3 passed

vitest run packages/api-contracts/src/index.test.ts
  25 passed

tsc -p packages/api-contracts/tsconfig.json --noEmit
  passed

tsc -p packages/api-client/tsconfig.json --noEmit
  passed

tsc -p apps/web/tsconfig.json --noEmit
  passed
```

The shared auth and MCP matrix targeted gates reported no advanced-mechanics gaps after these routes were added. Any remaining failures during the concurrent implementation run belonged to separate inventory/controlled-creature lanes.

## Explicitly not built

- Universal rules scripting or a user-authored executable DSL.
- Autonomous DM decisions, inferred map geometry, automated targeting, or automatic damage application from lair/regional text.
- Additional proprietary spell content or scraping.
- Controlled-creature/summon/transformation features, which were implemented in a separate scoped lane.
- Any item under the roadmap's “Not now” section.
