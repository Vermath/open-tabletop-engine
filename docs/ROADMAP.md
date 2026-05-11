# Roadmap

## Public Alpha v0.1

- Ship the SRD-only Ember Vault one-shot demo archive.
- Keep clean checkout setup to `pnpm install --frozen-lockfile`, `pnpm check`, API dev server, and web dev server.
- Prove GM/player realtime for scene visibility, owned-token movement, dice, chat, and combat.
- Keep AI GM help proposal/approval based with local/dev, OpenAI Responses, and Codex loopback provider documentation.
- Prove campaign export/import portability for scenes, assets, actors, tokens, journals, combat, rolls, permissions, and AI proposal records.
- Document one working plugin and one working system module with explicit permission boundaries.

## Post-Alpha

- Ship beta v0.2 dogfood with the three-session Ember Vault beta fixture, GM+3 realtime smoke, archive `0.2.0` export, alpha archive upgrade proof, safe content import primitives, and release/ops documentation.
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
- Finish final beta acceptance only after clean checkout, frozen install, `pnpm check`, API/web runtime, dogfood walkthrough, GM+3 realtime, export/import, AI eval, plugin/system smoke, and GitHub push proof.

## Out Of Scope

- Roll20 UI, brand, assets, sheets, marketplace data, or proprietary workflows.
- Proprietary D&D or D&D Beyond content.
- Scraping or bypassing access controls for third-party services.
