# Roadmap

## Public Alpha v0.1

- Ship the SRD-only Ember Vault one-shot demo archive.
- Keep clean checkout setup to `pnpm install --frozen-lockfile`, `pnpm check`, API dev server, and web dev server.
- Prove GM/player realtime for scene visibility, owned-token movement, dice, chat, and combat.
- Keep AI GM help proposal/approval based with local/dev, OpenAI Responses, and Codex loopback provider documentation.
- Prove campaign export/import portability for scenes, assets, actors, tokens, journals, combat, rolls, permissions, and AI proposal records.
- Document one working plugin and one working system module with explicit permission boundaries.

## Post-Alpha

- Beta v0.2 is accepted and pushed with the three-session Ember Vault beta fixture, GM+3 realtime smoke, archive `0.2.0` export, alpha archive upgrade proof, safe content import primitives, and release/ops documentation.
- Ship v0.3 outside dogfood so unaffiliated GMs can onboard, run multi-session games, recover from failures, and file useful reports.
- Broaden hosted deployment hardening, observability, and admin operations.
- Expand rules-system depth outside the primary `dnd-5e-srd` slice.
- Add safe importer adapters only where users provide legally reusable data or a documented permitted API exists.
- Mature plugin distribution with stronger signing, review, and registry workflows.
- Continue accessibility, mobile layout, and large-campaign performance work.

## Beta v0.2

- Prove `docs/demo/ember-vault-beta-dogfood.ottx.json` through `docs/demo/beta-dogfood-runbook.md`.
- Preserve alpha `0.1.0` archive imports and emit beta `0.2.0` exports.
- Keep D&D/SRD dogfood on `dnd-5e-srd` with supported/unsupported beta scope in `docs/system-sdk/dnd-srd-beta-support.md` and no proprietary content.
- Keep safe content imports as preview/apply/rollback/delete flows with provenance, license metadata, selective import, and audit logs.
- Keep AI and plugins permissioned, proposal-based, and auditable.
- Final beta acceptance is recorded in `docs/verification/beta-acceptance.md`.

## v0.3 Outside Dogfood

- Route non-expert GMs and players through `docs/dogfood/`.
- Keep v0.3 issue reports reproducible through the redacted dogfood Report Bundle and the v0.3 issue template.
- Keep safe content import usable in the web client with preview, apply, rollback, delete, provenance, license metadata, and audit logs.
- Verify restart recovery, failed-import recovery, backup/export/import, and beta archive compatibility before acceptance.
- Keep AI and plugins proposal-based, permissioned, and auditable.
- Accept v0.3 only after `pnpm check`, API/web runtime, GM+3 dogfood proof, three-session runbook proof, export/import proof, AI eval, and plugin/system smoke are recorded in `docs/verification/v0.3-dogfood-acceptance.md`.

## Out Of Scope

- Roll20 UI, brand, assets, sheets, marketplace data, or proprietary workflows.
- Proprietary D&D or D&D Beyond content.
- Scraping or bypassing access controls for third-party services.
