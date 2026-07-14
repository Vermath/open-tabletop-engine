# D&D custom content builders verification — 2026-07-13

## Delivered scope

- Typed campaign builders for monsters, spells, items, feats, species, backgrounds, subclasses, and conditions.
- Kind-specific fields and validation instead of a universal rules DSL or a JSON-only editor.
- Required source, content version, and license/private-use declarations. User-authored content cannot claim the reserved SRD provenance label.
- Read-only preview before create/update, with field-level errors and visible manual-adjudication warnings.
- GM/campaign-editor permission checks, optimistic revision checks, idempotent replay keys, audit records, and explicit delete confirmation.
- Campaign compendium integration and archive persistence using the existing user-provenance format.
- Accessible labels, loading/error/retry states, typed row editors for actions/traits/features, and narrow-screen layout.

The builders target the D&D 5.5e data model associated with the [official SRD 5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf). They do not bundle, scrape, or infer proprietary book content. Private-home-game content remains user supplied.

## Safety behavior

- A caller without `campaign.update` cannot list, preview, create, update, or delete builder records.
- Preview never mutates state.
- A stale campaign or item revision returns `409 stale_write` before any write.
- Create, update, and delete require `Idempotency-Key`; a replay returns the original response without a duplicate record.
- A `license.usage` value of `srd` is rejected for custom content, preventing homebrew from appearing official.
- Unsupported or ambiguous mechanics are descriptive/manual; the builder does not silently invent automation.

## Focused evidence

```text
corepack pnpm --filter @open-tabletop/system-sdk test -- dnd-custom-content.test.ts
5 passed

corepack pnpm --filter @open-tabletop/api test -- dnd-custom-content-api.test.ts
2 passed

corepack pnpm --filter @open-tabletop/api-contracts test -- dnd-custom-content-contract.test.ts
3 passed

corepack pnpm --filter @open-tabletop/api-client test -- dnd-custom-content-client.test.ts
1 passed

corepack pnpm --filter @open-tabletop/web test -- dnd-custom-content-panel.test.tsx
4 passed

corepack pnpm --filter @open-tabletop/system-sdk typecheck
pass

corepack pnpm --filter @open-tabletop/api-client typecheck
pass

corepack pnpm --filter @open-tabletop/web typecheck
pass
```

The API package typecheck is part of the final repository-wide gate because the shared API module was receiving concurrent P2 work during this focused verification.
