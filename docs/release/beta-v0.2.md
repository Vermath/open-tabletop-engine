# Beta v0.2 Release Notes

Date: 2026-05-11

## Summary

Beta v0.2 moves OpenTabletop Engine from public-alpha one-shot proof toward outside dogfood for real multi-session campaigns. The beta baseline keeps the API-first shape, SRD-only content policy, proposal-based AI/plugins, and self-hostable default.

## Highlights

- Added `docs/demo/ember-vault-beta-dogfood.ottx.json`, a three-session SRD-only dogfood campaign for 1 GM and 3 players.
- Added `docs/demo/beta-dogfood-runbook.md` with prep, three sessions, realtime checks, and export/import checkpoints.
- Updated campaign exports to schema `0.2.0` while preserving import support for `0.1.0` alpha archives.
- Added safe content import primitives for user-provided actor/item/journal/handout content with preview, provenance/license metadata, selective apply, rollback, delete, and audit logs.
- Added focused API regressions for beta dogfood import/export, alpha-to-beta archive upgrade, unsupported archive rejection, and content import rollback/delete.

## Compatibility

- Imports accepted: `.ottx` `0.1.0` and `0.2.0`.
- Exports produced: `.ottx` `0.2.0`.
- Primary rules runtime: `dnd-5e-srd`.
- Proprietary D&D, D&D Beyond, Roll20 content, scraping, auth bypass, and branded workflow cloning remain blocked.

## Known Beta Limits

- The beta dogfood fixture has focused API proof; final acceptance still requires the full API/web walkthrough and GM+3 realtime smoke.
- Safe content import primitives are API-first in this slice; web polish and import-status UX remain part of beta hardening.
- AI quality has fixture-backed smoke evidence; final acceptance still needs the dedicated eval run/report.
- Marketplace-scale distribution, payments, and exhaustive rules-system coverage remain post-beta.

## Validation Targets

Before tagging or announcing beta v0.2, run:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm --filter @open-tabletop/api dev
pnpm --filter @open-tabletop/web dev
```

Then record proof in `docs/verification/beta-acceptance.md` for the beta dogfood walkthrough, GM+3 realtime smoke, archive export/import, alpha archive upgrade, AI eval, plugin/system smoke, and clean-copy validation.
