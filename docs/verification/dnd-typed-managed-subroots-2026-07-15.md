# D&D typed managed subroots verification (2026-07-15)

- Scope: lossless, versioned typed views over existing flat D&D `Actor.data` and `Item.data`; no generic-system storage rewrite.
- Compatibility: unversioned legacy records parse to schema `1.0.0` views, preserve unknown/homebrew fields, and flatten back without data loss.
- Boundaries: D&D actor/item create and data patch reject malformed managed values with entity, schema, JSON Pointer, and error code; reviewed manual overrides can retain rules-level exceptions but cannot bypass structural errors. D&D actions validate source, target, and attached D&D items before resolution. Archive validation remains strict and now covers the same managed subroots.
- Plugin boundary: existing plugin runtime and proposal guards remain rename-only for actor/item records; rules data still requires typed system transactions.

Automated evidence:

- `pnpm --filter @open-tabletop/system-sdk typecheck`
- `pnpm --filter @open-tabletop/system-sdk exec vitest run src/dnd-validation-preview.test.ts --testTimeout=15000` (13/13)
- `pnpm --filter @open-tabletop/api typecheck`
- `pnpm --filter @open-tabletop/api exec vitest run src/dnd-managed-subroots-api.test.ts src/archive-dnd-validation.test.ts src/plugin-runtime.test.ts --testTimeout=30000` (36/36 after the API fixture supplies its required campaign revision)

Manual boundary: review one representative homebrew actor and item with a DM; automation proves preservation and sourced behavior but cannot confirm table intent.
