# D&D repair-preview verification — 2026-07-13

Status: implemented and locally verified as a read-only, confirmation-required preview. This is not an automatic migration or repair executor.

## Contract

- `previewDnd5eSrdActorRepairs` and `previewDnd5eSrdItemRepairs` are pure SDK functions over the versioned [official SRD 5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf) data boundary.
- Deterministic candidates cover missing SRD version markers, bounded current resource pools, and `alwaysPrepared` spell-state contradictions.
- Every candidate includes its JSON Pointer, exact before/after value, rationale, source versions, confirmation requirement, and exact inverse patch.
- The proposed entity is a lossless clone. Unknown and homebrew fields are preserved, and intent-sensitive validation issues remain manual.
- The actor rules-validation and campaign compatibility routes return the preview without persisting it. Private actor details keep the existing `actor.readPrivate` authorization boundary.

## Executed local evidence

```text
corepack pnpm --filter @open-tabletop/system-sdk typecheck
corepack pnpm --filter @open-tabletop/system-sdk exec vitest run src/dnd-validation-preview.test.ts
  1 file passed, 10 tests passed

corepack pnpm --filter @open-tabletop/core build
corepack pnpm --filter @open-tabletop/api typecheck
corepack pnpm --filter @open-tabletop/api exec vitest run src/rules-preview-api.test.ts src/calculation-compatibility.test.ts
  2 files passed, 11 tests passed

corepack pnpm --filter @open-tabletop/api-contracts exec vitest run src/calculation-compatibility.test.ts
  1 file passed, 1 test passed
```

The API tests repeat the same preview, compare it byte-for-byte after JSON parsing, and compare campaign state before and after both reads. They also prove that nested unknown data survives in the proposed entity and that denied users receive no private repair details.
