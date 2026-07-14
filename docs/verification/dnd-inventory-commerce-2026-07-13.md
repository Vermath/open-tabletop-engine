# D&D inventory and commerce verification — 2026-07-13

## Delivered slice

- Versioned `dnd5eInventory`, `dnd5ePartyStash`, `dnd5eMerchant`, and `dnd5eLoot` metadata on ordinary campaign items.
- Quantity and weight tracking, nested containers, five-level depth/cycle/ownership guards, per-container capacity summaries, and explicit extradimensional-storage review warnings.
- Strength/size-based carrying summaries with actor override support.
- Atomic partial-stack and full-container-subtree transfers between editable actor inventory and the GM-controlled party stash.
- Linked ammunition spending with weapon/ammunition/actor revision guards.
- Optional tracked merchant cash, bounded stock, copper-exact buy/sell accounting, manual-liquidity warnings, and no partial container sales.
- Typed combat loot creation, player claims, GM assignment, claimant/GM release, combat reward links, audits, realtime broadcasts, and archive persistence.
- Permission-safe overview redaction, strict expected revisions, and required replay keys for every consequential route.
- Reusable route builders, OpenAPI schemas/operations, typed API-client methods, auth/MCP coverage, and an accessible D&D Loadout integration surface.

## Focused verification

```text
corepack pnpm --filter @open-tabletop/core typecheck
corepack pnpm --filter @open-tabletop/system-sdk typecheck
corepack pnpm --filter @open-tabletop/system-sdk test -- src/dnd-inventory-commerce.test.ts
corepack pnpm --filter @open-tabletop/api typecheck
corepack pnpm --filter @open-tabletop/api test -- src/dnd-inventory-commerce.test.ts
corepack pnpm --filter @open-tabletop/api-contracts typecheck
corepack pnpm --filter @open-tabletop/api-contracts test
corepack pnpm --filter @open-tabletop/api-client typecheck
corepack pnpm --filter @open-tabletop/web typecheck
corepack pnpm --filter @open-tabletop/web test -- src/dnd-inventory-commerce-panel.test.tsx
corepack pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "covers non-admin application surfaces through MCP tools or explicit safety exclusions"
corepack pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "rejects unauthenticated and unauthorized campaign access"
```

The domain suite covers graph failures, quantity-aware carrying/container totals, extradimensional weight behavior, partial/full transfers, exact currency, and merchant parsing. The API suite covers replay-safe create/buy/sell flows, stale-write atomicity, container cycles, subtree transfer, ammunition, typed loot claim/assignment permissions, and archive validation. The UI suite covers the accessible initial state and typed data/currency normalization; the web typecheck covers the integrated actor Loadout surface.

## Deliberate rulings and manual boundaries

- Carrying capacity defaults to Strength × 15 pounds and applies supported size/override data. Unrecognized homebrew modifiers remain a manual-review warning.
- Container capacity and actor encumbrance are visible guardrails, not automatic movement-speed or condition mutations.
- Extradimensional contents do not add to the carrier's total, but nested extradimensional behavior is flagged for table adjudication.
- Merchant cash is optional. When absent, the API never invents a balance; it returns a manual-liquidity warning.
- Direct AI/plugin state mutation was not added. These are human-confirmed REST/UI operations with explicit permissions and audits.
