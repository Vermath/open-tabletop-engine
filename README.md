# OpenTabletop Engine

OpenTabletop Engine is an API-first virtual tabletop platform for campaigns, worlds, scenes, tokens, actors, items, handouts, journals, sessions, encounters, dice, chat, combat, portable campaign data, permissioned extensions, and auditable AI assistance.

## Product Principles

1. API-first.
2. Self-hostable by default.
3. No campaign lock-in.
4. Plugins are first-class citizens.
5. Rules systems are data-driven.
6. The GM owns campaign state.
7. AI is a first-class agent with governed proposal and automatic-execution modes; neither mode is treated as a second-class fallback.
8. Secrets are permissioned.
9. Everything important is exportable.
10. Every destructive action is reversible or auditable.

## Apps

- `apps/api`: Fastify REST and WebSocket server.
- `apps/web`: React VTT client.
- `apps/desktop`: Electron desktop host that runs the API and web client locally.
- `apps/relay`: Cloudflare Worker and Durable Object relay for internet sharing from a desktop host.
- `apps/worker`: HTTP-backed worker runner for exports, imports, and AI jobs.

## Packages

- `packages/core`: domain types, permissions, events, audit, proposals, export schemas.
- `packages/dice-engine`: dice notation parser and roller.
- `packages/api-contracts`: OpenAPI and shared route contracts.
- `packages/api-client`: typed TypeScript API client.
- `packages/plugin-sdk`: permissioned plugin SDK.
- `packages/system-sdk`: data-driven rules-system SDK.
- `packages/ai-core`: provider interface, tools, redaction, proposal helpers.
- `packages/codex-app-server-provider`: Codex app-server transport for AI turns, tools, and asset generation.
- `packages/tunnel-protocol`: validated relay frame protocol shared by desktop and relay.

## Documentation

- Public documentation index: `docs/site/index.md`
- Versioned changelog: `CHANGELOG.md`
- v1.0 release notes: `docs/release/v1.0.md`
- Current contract-to-journey feature audit: `docs/verification/feature-audit-2026-07-12.md`
- Self-hosting and deployment: `docs/deployment/self-hosting.md`
- Desktop hosting: `docs/deployment/desktop-hosting.md`
- Hosted deployment recipes: `docs/deployment/hosted-deployment-recipes.md`
- Railway persistence: `docs/deployment/railway-persistence.md`

Render the public documentation site locally:

```bash
pnpm docs:site:check
```

## Client UX

- Two crafted themes: Midnight (default) and Ember, toggled from the rail and persisted per browser.
- Command palette: press `Ctrl+K` (or `Cmd+K`) to jump to scenes, switch workspaces or campaigns, toggle the AI Agent, and roll dice formulas such as `2d6+3` directly from the search box.
- Quick dice tray in the chat rail builds formulas with one click; roll cards celebrate natural 20s and flag natural 1s.
- Optional 3D dice (`@3d-dice/dice-box-threejs`) land on the server-rolled values with a lightweight CSS fallback when WebGL is unavailable; the `3D` chip can switch to text-only roll cards on slower setups.

## Development

```bash
corepack enable # one-time: provides the pinned pnpm from package.json
pnpm install --frozen-lockfile
pnpm check
```

API defaults to `http://localhost:4000`. Web defaults to `http://localhost:5173`.

Start the API and web client in separate terminals:

```bash
pnpm --filter @open-tabletop/api dev
pnpm --filter @open-tabletop/web dev
```

Build or test the desktop and relay packages:

```bash
pnpm --filter @open-tabletop/desktop build
pnpm --filter @open-tabletop/desktop test
pnpm --filter @open-tabletop/relay test
pnpm --filter @open-tabletop/tunnel-protocol test
```

## Desktop Local Hosting

OpenTabletop can be packaged as an Electron desktop app for Windows and macOS. The desktop app starts the existing API on `127.0.0.1:<ephemeral>`, serves the built web client on `127.0.0.1:<ephemeral>`, and proxies `/api` plus realtime WebSockets to the local API. It uses SQLite and local asset storage under Electron `userData`:

- `data/opentabletop.sqlite`
- `uploads/`
- `plugins/`
- `logs/`
- `backups/`

Desktop defaults are local-first: `OTTE_ASSET_STORAGE=local`, `OTTE_AI_PROVIDER=disabled`, `OTTE_DEMO_SEED=false`, and `NODE_ENV=production`.

Remote friends can join through the managed relay without opening ports or paying for full campaign hosting. The host keeps an outbound WebSocket tunnel open to the relay, and players use invite links such as `https://share.open-tabletop.org/t/{slug}/join?invite=oti_...`. The relay intentionally stores table metadata only, not campaign state or asset bytes.

Desktop sharing is exposed in the web client only when `window.otteDesktop` exists. The panel can show local server status, start or stop internet sharing, copy the invite link, open the data folder, and export diagnostics.

## Desktop Releases

The `desktop-release` GitHub Actions workflow builds:

- Windows NSIS `.exe` installers.
- macOS `.dmg` packages for `x64` and `arm64`.
- SHA256 checksum files.

Signing and notarization are optional for the current desktop pipeline. Set repository variable `REQUIRE_DESKTOP_SIGNING=true` only when CI should fail unsigned builds. Signing secrets can be supplied later through electron-builder-compatible Apple, Authenticode, or Azure Trusted Signing variables.

Run a local unpackaged installer build with:

```bash
pnpm --filter @open-tabletop/desktop dist -- --dir
```

Tagged releases using `desktop-v*` upload artifacts to GitHub Releases.

## AI PDF Content Import

The content manager can upload a user-provided PDF for AI-assisted import. The API extracts text page by page, sends each page through the configured AI provider, and creates a preview content-import batch. Supported generated records include actors, items, journals, handouts, and encounters. Rules content such as classes, subclasses, feats, spells, equipment, backgrounds, species, and ancestry is normalized as reusable item records with provenance metadata.

The PDF route requires both `campaign.update` and `ai.proposeChanges`. Imported content is not applied directly; users review the generated batch, choose selected records, and then apply or roll it back through the normal content import workflow. Desktop keeps AI disabled by default unless the user configures Codex app-server.

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

- API-first campaign, world, scene, token, actor, item, handout, journal, session, encounter, search, chat, dice, combat, proposal, plugin, system, and scoped export/import surfaces.
- `dnd-5e-srd` as the primary rules runtime for the demo slice.
- Permission-filtered AI provider flow with candidate-to-approved campaign memory, encounter and recap workflows, both manual proposal review and governed automatic execution, revert/audit semantics, and a deterministic local structured fallback; provider setup is documented in `docs/ai/overview.md`.
- Permissioned plugin and system SDK examples documented under `docs/api/rest.md`, `docs/plugin-sdk/overview.md`, and `docs/system-sdk/overview.md`; plugin commands and subscribed events can request proposal-backed chat/storage changes, while system manifests are validated and installed durably under server-admin authority.
- Public-alpha extension smoke path: install `plugins/example-macro-plugin` on the imported demo with only `chat.write`, run `/spark`, and inspect installed systems or switch through `generic-fantasy` before restoring `dnd-5e-srd`.
- Beta dogfood path: accepted in `docs/verification/beta-acceptance.md`.
- v0.3 outside dogfood path: import the beta archive, follow the dogfood guides, run the three-session runbook, export archives and Report Bundles, and record final proof in `docs/verification/v0.3-dogfood-acceptance.md`.

## Content Safety

This repository must not ship proprietary Roll20, D&D Beyond, or non-SRD D&D content, assets, marketplace data, sheets, or branded workflows. Use only original, SRD, open, or otherwise legally reusable content.

D&D Beyond import is not implemented as a scraper or auth-bypass flow. Do not scrape it or bypass access controls. Safe adapter work must rely on user-provided exports or documented, permitted APIs and must keep proprietary content out of this repository.

## Licensing

The platform core is AGPL-3.0-only. SDK source code such as `packages/api-client`, `packages/plugin-sdk`, and `packages/system-sdk` is MIT-licensed so third-party plugin and system authors can reuse it without inheriting the platform license. Structured SRD-derived records distributed with `packages/system-sdk` remain CC BY 4.0 content and carry a package-local `CONTENT_NOTICE.md`; the published [System SDK code and content notice](docs/legal/system-sdk-content-notice.md) records the same distribution boundary and attribution. Documentation under `docs/` is CC BY 4.0.

Example plugins and systems should keep clear license metadata and must not bundle proprietary tabletop content.

## Validation

```bash
pnpm check
```
