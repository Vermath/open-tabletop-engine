# Campaign compendium verification - 2026-07-13

## Implemented scope

- A standalone campaign-library Compendium inspector that remains available without a selected scene token or actor sheet.
- Server-side text/type filtering and source/type count summaries, with a loading state, local error recovery, and retry controls.
- Required provenance on every bundled catalog entry: source kind/name/version, content version, system/rules versions, and license usage/attribution.
- SRD 5.2.1 and CC BY 4.0 labeling for the D&D catalog; open MIT labeling for the bundled example catalogs.
- Explicitly provenanced campaign homebrew entries for GMs/campaign editors, while ordinary readers receive only the permission-safe bundled catalog.
- Actor state inspection that distinguishes not imported, current, newer catalog version available, and legacy data without provenance.
- Optimistic actor revisions and required idempotency keys for imports and D&D equipment purchases.
- Typed exact-duplicate/version conflicts with explicit keep, merge, or replace resolution. No conflict path charges currency or mutates inventory before a choice is submitted.
- Stable item identity when merging or replacing an existing entry, with replace resetting catalog content and purchased quantity/cost to the requested version.
- Provenance retained on imported items/conditions and preserved by campaign archives.

## Permission and safety posture

- Catalog reads still require `campaign.read`; actor mutations require the existing explicit `actor.update` check.
- Campaign homebrew is included only when the caller has `campaign.update`, because actorless items do not have a standalone visibility field.
- Malformed, incomplete, or cross-system homebrew provenance is excluded rather than inferred.
- The compendium work made no changes to the existing AI agent. Plugin access continues through its normal campaign permission boundary.

## Verification run

- `@open-tabletop/core` build: passed.
- `@open-tabletop/system-sdk` provenance tests: 3 passed.
- `@open-tabletop/api` typecheck: passed.
- Focused API catalog, permission, archive, idempotency, stale-write, import-conflict, merge, and replace tests: 3 passed.
- Focused web compendium and async-guard tests: 20 passed.
- API contracts suite: 24 passed earlier in this slice.
- API client suite: 19 passed earlier in this slice.
- The repository-wide web typecheck now passes. The earlier concurrent character-creator diagnostic was resolved without changing the compendium contract.

## Deliberate non-goals

- No marketplace, plugin ecosystem, paid catalog, or remote pack distribution flow.
- No proprietary D&D rules text or scraping; only SRD/open content and explicitly user-provided campaign content.
- No rich custom-content builder or per-item visibility model in this pass.
