# OpenTabletop Engine

OpenTabletop Engine is an API-first virtual tabletop platform for campaigns, scenes, tokens, dice, chat, journals, combat, plugins, system modules, portable campaign data, and permissioned AI assistance.

## Product Principles

1. API-first.
2. Self-hostable by default.
3. No campaign lock-in.
4. Plugins are first-class citizens.
5. Rules systems are data-driven.
6. The GM owns campaign state.
7. AI proposes; humans approve.
8. Secrets are permissioned.
9. Everything important is exportable.
10. Every destructive action is reversible or auditable.

## Apps

- `apps/api`: Fastify REST and WebSocket server.
- `apps/web`: React VTT client.
- `apps/ai-gateway`: provider-agnostic AI gateway entrypoint.
- `apps/worker`: HTTP-backed worker runner for exports, imports, and AI jobs.

## Packages

- `packages/core`: domain types, permissions, events, audit, proposals, export schemas.
- `packages/dice-engine`: dice notation parser and roller.
- `packages/api-contracts`: OpenAPI and shared route contracts.
- `packages/api-client`: typed TypeScript API client.
- `packages/plugin-sdk`: permissioned plugin SDK.
- `packages/system-sdk`: data-driven rules-system SDK.
- `packages/ai-core`: provider interface, tools, redaction, proposal helpers.
- `packages/database`: Drizzle-ready schema definitions and migration notes.

## Development

```bash
pnpm install --frozen-lockfile
pnpm check
```

API defaults to `http://localhost:4000`. Web defaults to `http://localhost:5173`.

Start the API and web client in separate terminals:

```bash
pnpm --filter @open-tabletop/api dev
pnpm --filter @open-tabletop/web dev
```

## Public Alpha Demo

The public-alpha demo archive is `docs/demo/ember-vault-public-alpha.ottx.json`. It is an original, SRD-only one-shot with a scene/map, player character, NPC, monster token, journal/handout, combat, initiative, damage, healing, one condition, and an AI GM-help proposal that is pending approval.

To run it from a clean checkout:

1. Run `pnpm install --frozen-lockfile`.
2. Run `pnpm check`.
3. Start the API with `pnpm --filter @open-tabletop/api dev`.
4. Start the web client with `pnpm --filter @open-tabletop/web dev`.
5. Open `http://localhost:5173`.
6. Use the sidebar `Import` button and choose `docs/demo/ember-vault-public-alpha.ottx.json`.
7. Select `The Ember Vault: Public Alpha One-Shot` from the campaign list.
8. Use the session switcher to try the GM and player views. The imported demo users are `Demo GM` and `Demo Player`.

For a two-browser smoke test, open one browser as `Demo GM` and another as `Demo Player`. Verify the player can see public scene, chat, dice, handout, and owned-token state, while GM-only notes and pending AI proposal review remain permissioned.

## Beta v0.2 Dogfood

Beta v0.2 is accepted and pushed. The beta dogfood archive is `docs/demo/ember-vault-beta-dogfood.ottx.json`. It is an original, SRD-only three-session campaign fixture for 1 GM and 3 players. Use `docs/demo/beta-dogfood-runbook.md` for the prep, live play, combat, journals, handouts, actor updates, rests, loot/items, recap, AI memory, and export/import checkpoints.

Beta release and operations docs:

- `docs/release/beta-v0.2.md`
- `docs/deployment/upgrade-guide.md`
- `docs/deployment/backup-restore.md`
- `docs/deployment/beta-deployment-checklist.md`
- `docs/deployment/admin-observability-checklist.md`
- `docs/deployment/security-checklist.md`
- `docs/system-sdk/dnd-srd-beta-support.md`
- `docs/verification/beta-readiness.md`
- `docs/verification/beta-progress.md`
- `docs/verification/beta-acceptance.md`

Beta adds archive `0.2.0` exports while preserving alpha `0.1.0` import support. Safe content imports are preview/apply/rollback/delete flows for user-provided actor, item, journal, and handout content with provenance and license metadata.

## v0.3 Outside Dogfood

v0.3 is the current outside-dogfood track. It keeps the beta archive schema at `0.2.0`, adds a redacted dogfood Report Bundle export, exposes safe content import preview/apply/rollback/delete in the web client, and adds outside-GM onboarding.

Start here:

- New GM: `docs/dogfood/first-run-gm-guide.md`
- Player: `docs/dogfood/player-guide.md`
- Invites and sessions: `docs/dogfood/invite-session-guide.md`
- First live session: `docs/dogfood/run-your-first-session-checklist.md`
- Troubleshooting: `docs/dogfood/troubleshooting.md`
- Issue reports: `docs/dogfood/issue-reporting.md`
- Known issues: `docs/dogfood/known-issues.md`
- v0.3 proof: `docs/verification/v0.3-dogfood-readiness.md`, `docs/verification/v0.3-dogfood-progress.md`, and `docs/verification/v0.3-dogfood-acceptance.md`

## Current Scope

Current release tracks:

- API-first campaign, scene, token, actor, journal, chat, dice, combat, proposal, plugin, system, and export/import surfaces.
- `dnd-5e-srd` as the primary rules runtime for the demo slice.
- Local/dev AI provider flow with proposal/approval semantics; OpenAI Responses and Codex loopback providers are documented in `docs/ai/overview.md`.
- Permissioned plugin and system SDK examples documented under `docs/api/rest.md`, `docs/plugin-sdk/overview.md`, and `docs/system-sdk/overview.md`.
- Public-alpha extension smoke path: install `plugins/example-macro-plugin` on the imported demo with only `chat.write`, run `/spark`, and inspect installed systems or switch through `generic-fantasy` before restoring `dnd-5e-srd`.
- Beta dogfood path: accepted in `docs/verification/beta-acceptance.md`.
- v0.3 outside dogfood path: import the beta archive, follow the dogfood guides, run the three-session runbook, export archives and Report Bundles, and record final proof in `docs/verification/v0.3-dogfood-acceptance.md`.

## Content Safety

This repository must not ship proprietary Roll20, D&D Beyond, or non-SRD D&D content, assets, marketplace data, sheets, or branded workflows. Use only original, SRD, open, or otherwise legally reusable content.

D&D Beyond import is not implemented as a scraper or auth-bypass flow. Do not scrape it or bypass access controls. Safe adapter work must rely on user-provided exports or documented, permitted APIs and must keep proprietary content out of this repository.

## Licensing

The platform core is AGPL-3.0-only. SDK packages such as `packages/api-client`, `packages/plugin-sdk`, and `packages/system-sdk` are MIT-licensed so third-party plugin and system authors can reuse them without inheriting the platform license. Documentation under `docs/` is CC BY 4.0.

Example plugins and systems should keep clear license metadata and must not bundle proprietary tabletop content.

## Validation

```bash
pnpm check
```
