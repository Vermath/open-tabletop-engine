# D&D post-creation spell preparation verification

Implemented on 2026-07-13 for the `dnd-5e-srd` runtime.

## Supported boundary

- A pure system-SDK preview derives preparation legality from stored actor and actor-owned spell items.
- Stored current-level capacity is authoritative; the supported class table supplies a fallback only at character level one.
- Always-prepared spells and cantrips are excluded from normal capacity.
- Selected spells must carry matching `classSpell` and class-source provenance. Wizards also require stored item and actor spellbook membership.
- Long Rest versus class-level change timing is explicit and server-checked.
- Later-level acquisition, incomplete imported/legacy state, and homebrew with unproven legality return manual blockers.

## Mutation safety

- Preview and apply require actor-update authority, `Idempotency-Key`, the actor revision, and a complete actor-owned spell-item revision map.
- Apply loads the stored ready preview, rechecks authorization and every revision, recomputes the plan from server state, then updates the actor and changed items in one save.
- The actor stores compendium spell ids and the reviewed timing; item `prepared` flags share the same revision timestamp.
- One redacted `system.actor.spellPreparationApplied` audit record captures item ids and boolean transitions.
- Generic item PATCH rejects `prepared` changes on provenance-managed D&D class spells.

## Product surface

- The actor Loadout tab has a dedicated timing/selection preview, capacity and blocker review, exact-change list, explicit confirmation, and apply action.
- D&D spells no longer expose generic direct or bulk preparation controls. Generic-system magic and D&D ritual/talent controls retain their prior behavior.

## Focused verification commands

```bash
node scripts/run-package-manager.mjs --filter @open-tabletop/system-sdk test -- dnd-spell-preparation-preview.test.ts spell-preparation.test.ts
node scripts/run-package-manager.mjs --filter @open-tabletop/api test -- spell-preparation-api.test.ts
node scripts/run-package-manager.mjs --filter @open-tabletop/api-contracts test -- dnd-spell-preparation-contract.test.ts
node scripts/run-package-manager.mjs --filter @open-tabletop/api-client test -- dnd-spell-preparation-client.test.ts
node scripts/run-package-manager.mjs --filter @open-tabletop/web test -- spell-preparation-ui.test.ts actor-loadout-panel.test.tsx
```
